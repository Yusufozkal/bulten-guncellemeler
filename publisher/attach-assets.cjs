'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const REPO='Yusufozkal/bulten-guncellemeler',RELEASE_ID=422796451,TAG='v3.2.0';
const BYTES=104397607,SHA256='77f7c21c15b04e13040d3df8819359a3a66861dc27a401715a8dc9d6e2721e92',KEY_ID='ed25519:c5584085b0c35f1c2bf52142e322236f';
const FILE='Bulten-Studio-3.2.0-Setup.exe',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const C=require('./update-contract.cjs');
function requireValue(condition,message){if(!condition)throw Error(message);}
function validatePlan(p){
 requireValue(p&&p.schema==='bulten-release-upload-plan'&&p.schemaVersion===1&&p.repository===REPO&&p.releaseId===RELEASE_ID&&p.tag===TAG,'Upload plan identity mismatch.');
 requireValue(p.installer&&p.installer.fileName===FILE&&p.installer.bytes===BYTES&&p.installer.sha256===SHA256,'Installer identity mismatch.');
 requireValue(Array.isArray(p.chunks)&&p.chunks.length===13,'Unexpected chunk count.');let total=0;
 for(const chunk of p.chunks){requireValue(chunk&&/^[0-9a-f]{40}$/.test(chunk.sha)&&/^[0-9a-f]{64}$/.test(chunk.sha256)&&Number.isSafeInteger(chunk.bytes)&&chunk.bytes>0&&chunk.bytes<=8388608,'Invalid chunk.');total+=chunk.bytes;}
 requireValue(total===BYTES,'Chunk byte count mismatch.');return p;
}
function verifyChunk(chunk,bytes){requireValue(bytes.length===chunk.bytes&&sha(bytes)===chunk.sha256,'Chunk size/hash mismatch.');const git=crypto.createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');requireValue(git===chunk.sha,'Git blob identity mismatch.');}
function validateRelease(r){requireValue(r&&r.id===RELEASE_ID&&r.tag_name===TAG&&r.draft===true&&r.prerelease===false,'Only the expected draft release can receive files.');requireValue(Array.isArray(r.assets)&&r.assets.every(a=>[FILE,'latest.json'].includes(a.name)),'Unexpected existing release asset.');return r;}
function loadData(directory=__dirname){
 const plan=validatePlan(JSON.parse(fs.readFileSync(path.join(directory,'upload-plan.json'),'utf8'))),raw=fs.readFileSync(path.join(directory,'latest.json'));
 const pin=JSON.parse(fs.readFileSync(path.join(directory,'update-public-key.json'),'utf8'));requireValue(pin.keyId===KEY_ID,'Public key identity mismatch.');
 const checked=C.verifyEnvelope(raw,{publicKey:pin,appVersion:'3.2.0'}).payload;
 requireValue(checked.version==='3.2.0'&&checked.sequence===30200&&checked.installer.fileName===FILE&&checked.installer.size===BYTES&&checked.installer.sha256===SHA256&&checked.installer.url==='https://github.com/'+REPO+'/releases/download/'+TAG+'/'+FILE,'Signed installer metadata mismatch.');
 return{plan,raw,pin};
}
function gh(args,maxBuffer=1024*1024){return execFileSync('gh',args,{encoding:null,maxBuffer,stdio:['ignore','pipe','pipe'],timeout:180000});}
function api(endpoint,maxBuffer=1024*1024,accept){const args=['api','repos/'+REPO+'/'+endpoint];if(accept)args.push('-H','Accept: '+accept);return gh(args,maxBuffer);}
function release(){return validateRelease(JSON.parse(api('releases/'+RELEASE_ID).toString('utf8')));}
function existingMatches(asset,expectedHash,expectedBytes){
 requireValue(Number.isSafeInteger(asset.id)&&asset.id>0&&asset.size===expectedBytes,'Existing asset size/id mismatch.');
 if(asset.digest==='sha256:'+expectedHash)return true;
 const bytes=api('releases/assets/'+asset.id,expectedBytes+65536,'application/octet-stream');requireValue(bytes.length===expectedBytes&&sha(bytes)===expectedHash,'Existing release asset does not match.');return true;
}
function main(){
 requireValue(process.env.GITHUB_REPOSITORY===REPO&&process.env.GITHUB_REF==='refs/heads/main','Run this workflow only on its main repository branch.');
 const{plan,raw}=loadData();release();
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bulten-release-'));fs.chmodSync(directory,0o700);
 try{
  const installer=path.join(directory,FILE),fd=fs.openSync(installer,'wx',0o600);let total=0;const hash=crypto.createHash('sha256');
  try{for(let i=0;i<plan.chunks.length;i++){const chunk=plan.chunks[i],bytes=api('git/blobs/'+chunk.sha,8388608+65536,'application/vnd.github.raw+json');verifyChunk(chunk,bytes);fs.writeFileSync(fd,bytes);hash.update(bytes);total+=bytes.length;console.log('Verified chunk '+(i+1)+'/'+plan.chunks.length);}fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  requireValue(total===BYTES&&fs.statSync(installer).size===BYTES&&hash.digest('hex')===SHA256,'Assembled installer verification failed.');
  const manifest=path.join(directory,'latest.json');fs.writeFileSync(manifest,raw,{mode:0o600,flag:'wx'});
  const expected=[{name:FILE,file:installer,size:BYTES,hash:SHA256},{name:'latest.json',file:manifest,size:raw.length,hash:sha(raw)}];
  for(const item of expected){const state=release(),asset=state.assets.find(a=>a.name===item.name);if(asset){existingMatches(asset,item.hash,item.size);console.log('Verified existing asset '+item.name);}else{const uploaded=JSON.parse(gh(['api','--method','POST','https://uploads.github.com/repos/'+REPO+'/releases/'+RELEASE_ID+'/assets?name='+encodeURIComponent(item.name),'-H','Content-Type: application/octet-stream','--input',item.file],1024*1024).toString('utf8'));requireValue(uploaded.name===item.name,'Uploaded asset identity mismatch.');existingMatches(uploaded,item.hash,item.size);console.log('Attached '+item.name);}}
  const state=release();requireValue(state.assets.length===2,'Incomplete release asset set.');for(const item of expected)existingMatches(state.assets.find(a=>a.name===item.name),item.hash,item.size);
  console.log(JSON.stringify({releaseId:RELEASE_ID,tag:TAG,draft:true,published:false,verifiedAssets:expected.map(x=>x.name)}));
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
}
if(require.main===module){try{main();}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={validatePlan,verifyChunk,validateRelease,loadData};
