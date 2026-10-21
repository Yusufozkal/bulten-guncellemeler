'use strict';

const crypto = require('node:crypto');
const path = require('node:path');

const APP_ID = 'com.bultenstudio.app';
const MAX_INSTALLER_BYTES = 256 * 1024 * 1024;
const MAX_ENVELOPE_BYTES = 65536;
const PAYLOAD_SCHEMA = 'bulten-studio-update';
const ENVELOPE_SCHEMA = 'bulten-update-envelope';
const PUBLIC_KEY_SCHEMA = 'bulten-update-public-key';
const VERSION_RE = /^(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})$/;
const PAYLOAD_FIELDS = ['schema', 'schemaVersion', 'appId', 'platform', 'arch', 'channel', 'version', 'sequence', 'publishedAt', 'installer', 'notes'];

function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exactFields(value, fields, message) {
  if (!record(value) || Object.keys(value).length !== fields.length || fields.some(field => !Object.prototype.hasOwnProperty.call(value, field)) || Object.keys(value).some(field => !fields.includes(field))) throw new Error(message);
}
function parseVersion(value) {
  const match = typeof value === 'string' && VERSION_RE.exec(value);
  if (!match) throw new Error('Sürüm numarası geçerli bir ana.alt.yama biçiminde olmalı.');
  const parts = match.slice(1).map(Number);
  if (parts.some(part => part > 65535)) throw new Error('Sürüm numarası desteklenen sınırı aşıyor.');
  return parts;
}
function compareVersions(left, right) {
  const a = parseVersion(left), b = parseVersion(right);
  for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  return 0;
}
function validateFeedUrl(value) {
  if (typeof value !== 'string' || !value || value.length > 4096 || /[\u0000-\u0020\u007f\\]/.test(value)) throw new Error('Güncelleme adresi geçerli bir HTTPS adresi olmalı.');
  let url;
  try { url = new URL(value); } catch (_) { throw new Error('Güncelleme adresi geçerli bir HTTPS adresi olmalı.'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) throw new Error('Güncelleme adresi yalnızca kimlik bilgisi içermeyen HTTPS bağlantısı olabilir.');
  return url.href;
}
function strictBase64(value, maximum, label) {
  if (typeof value !== 'string' || !value || value.length % 4 !== 0 || value.length > Math.ceil(maximum / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error(label + ' verisi geçersiz.');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > maximum || bytes.toString('base64') !== value) throw new Error(label + ' verisi geçersiz.');
  return bytes;
}
function asPublicKey(value) {
  let pem = value, expectedId;
  if (record(value)) {
    exactFields(value, ['schema', 'algorithm', 'keyId', 'publicKey'], 'Güncelleme doğrulama anahtarı okunamadı.');
    if (value.schema !== PUBLIC_KEY_SCHEMA || value.algorithm !== 'Ed25519' || typeof value.keyId !== 'string' || !/^ed25519:[0-9a-f]{32}$/.test(value.keyId)) throw new Error('Güncelleme doğrulama anahtarı desteklenmiyor.');
    pem = value.publicKey; expectedId = value.keyId;
  }
  if (typeof pem !== 'string' || pem.length > 4096 || !pem.startsWith('-----BEGIN PUBLIC KEY-----')) throw new Error('Güncelleme doğrulama anahtarı geçersiz.');
  let key;
  try { key = crypto.createPublicKey(pem); } catch (_) { throw new Error('Güncelleme doğrulama anahtarı geçersiz.'); }
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Yalnızca Ed25519 güncelleme anahtarları desteklenir.');
  const id = keyIdForKey(key);
  if (expectedId && expectedId !== id) throw new Error('Güncelleme anahtar kimliği eşleşmiyor.');
  return { key, keyId: id, publicKey: key.export({ type: 'spki', format: 'pem' }).toString() };
}
function keyIdForKey(key) { return 'ed25519:' + crypto.createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 32); }
function keyIdForPublicKey(value) { return asPublicKey(value).keyId; }
function normalizePublicKey(value) {
  const key = asPublicKey(value);
  return { schema: PUBLIC_KEY_SCHEMA, algorithm: 'Ed25519', keyId: key.keyId, publicKey: key.publicKey };
}
function validatePayload(value) {
  exactFields(value, PAYLOAD_FIELDS, 'Güncelleme sürüm bilgileri eksik veya desteklenmiyor.');
  if (value.schema !== PAYLOAD_SCHEMA || value.schemaVersion !== 1 || value.appId !== APP_ID || value.platform !== 'win32' || value.arch !== 'x64' || value.channel !== 'stable') throw new Error('Güncelleme bu uygulama, platform veya yayın kanalı için değil.');
  parseVersion(value.version);
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 1 || value.sequence > Number.MAX_SAFE_INTEGER) throw new Error('Güncelleme yayın sırası geçersiz.');
  if (typeof value.publishedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.publishedAt) || !Number.isFinite(Date.parse(value.publishedAt)) || new Date(value.publishedAt).toISOString() !== value.publishedAt) throw new Error('Güncelleme yayın tarihi geçersiz.');
  if (typeof value.notes !== 'string' || value.notes.length > 8000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.notes)) throw new Error('Güncelleme notları geçersiz veya çok uzun.');
  exactFields(value.installer, ['fileName', 'url', 'sha256', 'size'], 'Kurulum dosyasının bilgileri eksik veya desteklenmiyor.');
  const installer = value.installer;
  if (typeof installer.fileName !== 'string' || installer.fileName.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._ -]*\.exe$/i.test(installer.fileName) || installer.fileName.includes('..') || path.basename(installer.fileName) !== installer.fileName || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(installer.fileName)) throw new Error('Kurulum dosyasının adı geçersiz.');
  validateFeedUrl(installer.url);
  if (typeof installer.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(installer.sha256)) throw new Error('Kurulum dosyasının doğrulama özeti geçersiz.');
  if (!Number.isSafeInteger(installer.size) || installer.size < 1 || installer.size > MAX_INSTALLER_BYTES) throw new Error('Kurulum dosyası desteklenen boyut sınırını aşıyor.');
  return value;
}
function decodeUtf8(bytes, label) {
  const value = bytes.toString('utf8');
  if (!Buffer.from(value, 'utf8').equals(bytes)) throw new Error(label + ' geçerli UTF-8 değil.');
  return value;
}
function verifyEnvelope(rawBytes, options = {}) {
  if (!(Buffer.isBuffer(rawBytes) || typeof rawBytes === 'string' || rawBytes instanceof Uint8Array)) throw new Error('Güncelleme yanıtı okunamadı.');
  const bytes = Buffer.isBuffer(rawBytes) ? rawBytes : Buffer.from(rawBytes);
  if (!bytes.length || bytes.length > MAX_ENVELOPE_BYTES) throw new Error('Güncelleme yanıtı çok büyük veya boş.');
  let envelope;
  try { envelope = JSON.parse(decodeUtf8(bytes, 'Güncelleme yanıtı')); } catch (_) { throw new Error('Güncelleme yanıtı geçerli JSON değil.'); }
  exactFields(envelope, ['schema', 'keyId', 'payload', 'signature'], 'İmzalı güncelleme bilgileri desteklenmiyor.');
  if (envelope.schema !== ENVELOPE_SCHEMA || typeof envelope.keyId !== 'string' || !/^ed25519:[0-9a-f]{32}$/.test(envelope.keyId)) throw new Error('Güncelleme imza biçimi desteklenmiyor.');
  const publicInfo = asPublicKey(options.publicKey);
  if (publicInfo.keyId !== envelope.keyId) throw new Error('Güncelleme bilinmeyen bir anahtarla imzalanmış.');
  const payloadBytes = strictBase64(envelope.payload, MAX_ENVELOPE_BYTES, 'Güncelleme içeriği');
  const signature = strictBase64(envelope.signature, 64, 'Güncelleme imzası');
  if (signature.length !== 64 || !crypto.verify(null, payloadBytes, publicInfo.key, signature)) throw new Error('Güncelleme imzası doğrulanamadı. Dosya değiştirilmiş olabilir.');
  let payload;
  try { payload = JSON.parse(decodeUtf8(payloadBytes, 'Güncelleme içeriği')); } catch (_) { throw new Error('İmzalı güncelleme içeriği okunamadı.'); }
  validatePayload(payload);
  const highest = options.highestSequence === undefined ? 0 : options.highestSequence;
  if (!Number.isSafeInteger(highest) || highest < 0) throw new Error('Yerel güncelleme yayın kaydı geçersiz.');
  if (payload.sequence < highest) throw new Error('Daha eski bir güncelleme yayını reddedildi.');
  return { payload, isNewer: compareVersions(payload.version, options.appVersion) > 0 };
}
function createEnvelope(payload, privateKey) {
  validatePayload(payload);
  let key;
  try { key = crypto.createPrivateKey(privateKey); } catch (_) { throw new Error('İmzalama anahtarı okunamadı.'); }
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('İmzalama için Ed25519 özel anahtarı gerekli.');
  const raw = Buffer.from(JSON.stringify(payload), 'utf8');
  const envelope = { schema: ENVELOPE_SCHEMA, keyId: keyIdForKey(crypto.createPublicKey(key)), payload: raw.toString('base64'), signature: crypto.sign(null, raw, key).toString('base64') };
  if (Buffer.byteLength(JSON.stringify(envelope), 'utf8') > MAX_ENVELOPE_BYTES) throw new Error('İmzalı güncelleme bilgileri çok büyük.');
  return envelope;
}

module.exports = { APP_ID, MAX_INSTALLER_BYTES, MAX_ENVELOPE_BYTES, PAYLOAD_SCHEMA, ENVELOPE_SCHEMA, PUBLIC_KEY_SCHEMA, compareVersions, validateFeedUrl, verifyEnvelope, normalizePublicKey, keyIdForPublicKey, validatePayload, createEnvelope };
