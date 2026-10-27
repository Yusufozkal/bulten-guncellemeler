# Bülten Studio — Windows güncellemeleri

Bülten Studio kurucuları bu deponun [Releases](https://github.com/Yusufozkal/bulten-guncellemeler/releases) bölümünde yayımlanır.

## Kurulum ve güncelleme

- Windows 10/11, 64 bit gerekir.
- 3.0 veya önceki sürümlerde güncelleme istemcisi yoktur; güncel kurucu bir kez elle kurulmalıdır.
- 3.1 ve sonraki sürümlerde **Güncellemeler → Güncelleme ayarları** bölümüne şu depo bağlantısını kaydedin:

```
https://github.com/Yusufozkal/bulten-guncellemeler
```

Otomatik denetim açıkken en fazla günde bir sürüm kontrol edilir. İndirme ve kurulum kullanıcı tarafından başlatılır. Kurulumdan önce açık projenin yedeği alınır. Çalışmalarınızı ayrıca `.bulten` dosyası olarak saklayın.

Sabit yayın adresi:

```
https://github.com/Yusufozkal/bulten-guncellemeler/releases/latest/download/latest.json
```

## Doğrulama

`latest.json` yayın bilgisi Ed25519 ile imzalanır. Uygulama sabit genel anahtarını, sürümü, dosya boyutunu ve SHA-256 özetini kontrol eder. Özel imzalama anahtarı yayın dosyalarında bulunmaz.

Bu doğrulama Windows Authenticode yayıncı sertifikası değildir; Windows yayıncı uyarısı devam edebilir. Kaynak ve paket kontrolleri yapılmıştır; bu yayının gerçek Windows cihazında kurulumu henüz doğrulanmamıştır.

Bu depo güncelleme dağıtımı içindir. Uygulamanın kaynak kodu bu depoda yayımlanmamaktadır.

## 3.1.1 güvenlik yaması

Zararlı görsel/proje dosyalarının aşırı kaynak tüketimi, kesilen güncelleme kaydında eski imzalı yayının yeniden önerilmesi ve kayıt başarısızken kapanma düzeltildi. Electron 44.9.3 kullanılır. 48 MP üzerindeki fotoğraflar için küçültülmüş kopya gerekir.

## 3.1.2 hata düzeltmeleri

UTF-8 BOM içeren projelerin açılması, %600 fotoğraf yakınlaştırması, video hazırlığını iptal etme, geciken proje okuması ve güncelleme hatasından sonra doğrulanmış indirmeyi/kurulumu yeniden deneme düzeltildi. Hatalı güncelleme ayarı girildiğinde adres ve seçenekler korunur. Proje biçimi ve uygulama kimliği değişmez.

## 3.2.0 video düzenleyici

Yerel MP4/WebM dosyalarını kesme, kadraj ve döndürme, ses seviyesi, yazı ekleme ve en fazla 60 saniyelik çıktı alma eklendi. Videolar sunucuya yüklenmez; mevcut animasyon aracı korunur. Çıktı biçimi cihazın video kodlayıcısına bağlıdır.
