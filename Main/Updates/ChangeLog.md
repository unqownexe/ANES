# ANES — ChangeLog

> ANES uygulamasının tüm sürüm geçmişi, değişiklikleri ve düzeltmeleri.




| | |
|---|---|
| **Son Sürüm** | `2.0.0` — 12 Kasım 2026 |

---

<a id="v2-0-0"></a>
## 2.0.0 — 12 Kasım 2026

### Eklenenler

#### Maskot ve Animasyonlar
- Maskot artık duruma göre farklı ruh hallerine bürünüyor: **bekliyor**, **düşünüyor**, **yazıyor**, **mutlu**, **üzgün**.
- Ruh hali değişince maskot küçük bir "pop" animasyonu yapıyor.

#### CTRL Komut Modu
- Kapalı çentikte **CTRL** basılı tutunca medya kontrol şeridi açılıyor.
- Şeritte **önceki** / **oynat-duraklat** / **sonraki** düğmeleri yer alıyor.
- Şeritte sürüklenebilir ilerleme çubuğu ve geçen/kalan süre gösteriliyor.
- Çubuğa tıklayınca o konuma atlıyor; sürükleyince canlı takip ediyor.
- CTRL basılıyken sağa/sola kaydırma önceki/sonraki şarkıya geçiyor.

#### Video İndirici
- Playlist indirmeleri klasörlenebiliyor.
- Dosya adı biçimi seçilebiliyor: `sayı-kanal-başlık`, `kanal-başlık` veya `başlık`.
- Başarısız indirme 3 kez daha deneniyor.
- Takılan indirme 180 saniye sonra yeniden başlatılıyor.
- Panoya alt alta birden çok bağlantı kopyalanınca onay OSD'si çıkıyor.
- Ayrı günlük dosyası tutuluyor; son 5 çalıştırma saklanıyor.
- Kapalı çentikte kaç satır indirme gösterileceği ayarlanabiliyor.
- Çoklu bağlantı ve playlist soruları OSD ile gösteriliyor.

### Değiştirilenler

#### Maskot ve Animasyonlar
- Göz takibi yumuşatıldı; fare uzaklaşınca göz ortaya dönüyor.
- Kulaklık ve büyüteç çizimleri yenilendi: mavi gövde, ses dalgaları, notalar, amber saplı büyüteç.

#### CTRL Komut Modu
- CTRL basılıyken çentik genişliği sabit kalıyor; şarkı değişince küçülmüyor.
- Şarkı değişince OSD bildirimi gelmiyor; bilgi çentiğin kendi içinde güncelleniyor.

### Düzeltilenler

#### Maskot ve Animasyonlar
- Maskotun renkli parçaları artık birlikte sönüyor; tek parça kalmıyor.

#### CTRL Komut Modu
- Maximize/tam ekran uygulamada hover olmadan CTRL etkinleşmiyor; çentik kendiliğinden büyümüyor.

#### Medya
- Explorer veya Spotify yeniden başlayınca artık "Müzik yok" görünmüyor; oturum geri gelince normale dönüyor.
- Parça çalarken başlık bir an boş gelse bile son bilinen bilgiler korunuyor.

---

<a id="v1-9-0"></a>
## 1.9.0 — 11 Kasım 2026

> **Not:** 1.9.0 changelog'u AI'ye yazdırılmıştır; 1.8.0 ile benzer özellikler görülebilir.

### Eklenenler ve İyileştirmeler

#### Müzik Videoları (BETA)
- Müzik ve Sözler ekranlarında artık şarkının resmi klibinden kısa bir kolaj arka planda oynatılabiliyor. Özellik varsayılan olarak **kapalı**; **Ayarlar → Müzik ve Sözler → Video (BETA)** bölümünden açılıyor.
- Şarkı Spotify dışı bir kaynaktan (YouTube, Chrome vb.) çalıyorsa ANES şarkıyı Spotify'da arıyor. Önce Spotify'ın kendi Canvas videosu varsa onu indiriyor; yoksa YouTube'da resmi klibi bulup indiriyor.
- İndirilen video tamamen saklanmıyor; baştan, çeyrekten, ortadan, üç çeyrekten ve sondan 5'er saniyelik toplam **~25 saniyelik bir kolaj** üretiliyor. Hem hızlı iniyor hem az yer kaplıyor.
- **Kalite** (En iyi / 1080p / 720p / 480p / 360p) ve **depolama sınırı** (100–900 MB) seçilebiliyor. Sınır aşılınca en eski videolar otomatik siliniyor.
- Sadece kapak resminden oluşan **sabit kareli videolar** algılanıyor; bunlar için 25 saniyelik kolaj yerine 2 saniyelik kısa görüntü kullanılıyor.
- Şarkı adı benzerliği filtresiyle alakasız sonuçlar eleniyor; yanlış şarkının videosu indirilmiyor.
- Spotify dışı kaynakta şarkı **duraklatılınca video da yumuşakça gizleniyor**, devam edince geri geliyor.
- Yatay videolar çentik daralırken sol taraftaki bilgilerle çakışmıyor; genişlik videonun oranına göre ayarlanıyor.
- 1 dakikadan kısa içerikler için video araması yapılmıyor; parça değişince eski arama iptal edilip yeni parça 2 saniye içinde yeniden deneniyor.

#### AI Ayarları
- DeepSeek bağlantısı tamamen kaldırıldı. Artık **kendi API adresinizi ve API anahtarlarınızı** girebiliyorsunuz.
- Birden fazla anahtar virgülle girilebiliyor; biri limite takılınca otomatik olarak sıradakine geçiliyor.
- Model listesi otomatik geliyor, isterseniz kendiniz de yazabiliyorsunuz. **"Test et"** düğmesiyle bağlantıyı hemen deneyebiliyorsunuz.

#### Müzik Ekranı Üst Şeridi
- Müzik ekranı ve ana sayfada, sağ üstteki eq dalgalarının solunda **o anki söz satırı** görünüyor. Satır değişince yumuşak animasyonla yenileniyor.
- Uzun söz satırı ana sayfada saat/tarih ile çakışmıyor.

#### Ses Görselleri
- **Bass analizi baştan yazıldı:** Sub-bas (22–60 Hz) ve kick (60–150 Hz) bantları ayrı ayrı ölçülüyor. Dalga artık sadece ses seviyesine değil, gerçek vuruşlara tepki veriyor.
- Vuruşlar şarkının kendi ritmine göre normalize ediliyor; her şarkıda doğru çalışıyor.
- **Dalga boyu** basa ve hareketliliğe göre büyüyor; sub-bas vurunca dalga beyaza kayıp parlıyor. Arka plan noktaları kick vuruşunda büyüyüp parlıyor.
- **Canvas videosu** basa göre açılıyor; yoğun bas bölümlerinde her vuruşta hafif beyaz parlama oluyor.
- "Aşırı hareketli" ölçümü artık vuruş sayısına göre; hareketli şarkılarda dalga daha canlı, sakin şarkılarda daha sakin.

#### Performans ve Ayarlar
- **Ayarlar → Görünüm → Performans**'a **"Kapalı çentik FPS"** eklendi (30 / 45 / 60, varsayılan 30). Kapalı çentikte sadece ortam hareketi varken bu sınır kullanılıyor; CPU/GPU tasarrufu sağlıyor.
- Tam ekran "gizle" modunda pencere tamamen gizliyken artık kare üretilmiyor; **GPU kullanımı sıfıra** iniyor.
- **Intro ve outro animasyonları** ayarlardan bağımsız olarak 120 FPS'te çiziliyor (monitör 120 Hz'den yavaşsa monitörün hızında).

### Düzeltilenler
- Aynı uygulamada birden fazla medya oturumu (ör. iki Chrome sekmesi) varsa artık **çalan oturum** seçiliyor; duraklatılmış sekmede takılıp kalmıyor.
- YouTube gibi tarayıcı oynatıcılarında **ilerleme çubuğu** artık düzgün ilerliyor.
- Log dosyalarında Türkçe karakter bozulması giderildi; loglar artık tamamen geçerli UTF-8.
- Canvas beyaz flaşı sözlerin/başlığın saydam kalmasına neden olmuyor.
- İndirilen BETA Canvas videolarının sağ kenarında görünen yeşil çizgi giderildi.
- Gerçek Canvas videosu olmayan şarkılarda sözler ekranı boş yere daralmıyor.
- Yerel kayıtta zaten olan Canvas videoları için tekrar ağa çıkılmıyor.

---

<a id="v1-8-0"></a>
## 1.8.0 — 11 Kasım 2026

### Değiştirilenler

#### Performans
- Ciddi performans kaybı giderildi; boştayken bile görülen **~%10 CPU / ~%15 GPU** kullanımı düşürüldü.

#### Video İndirici
- Maksimum sıra sayısı **5'ten sınırsıza** çıkarıldı.
- 5'ten fazla sıra olduğunda çentik boş yere büyümüyor.
- 5'ten fazla sırada da playlist/video sorusu soruluyor.
- İndirmeler rate limit'e takılmayacak şekilde tekrar düzenlendi.
- ANES kapatılıp açıldığında indirmeler kaldığı yerden devam ediyor.
- **Ayarlar → Aktif İndirmeler** bölümü daha detaylı gösteriliyor.
- Ayarlara tüm indirmeleri veya tek bir sırayı iptal etme özelliği eklendi.

### Düzeltilenler

#### Video İndirici
- Aktif indirmeler yalnızca 5 tanesini gösteriyordu; playlist indirmelerinde kalan video sayısı görünmüyordu.
- Bilinen bir crash sorunu giderildi.
- İndirilen dosyaların tekrar indirilmesi sorunu giderildi.
- Playlist tekrar indirilirken playlistin iki kez indirilmesi sorunu giderildi.

---

<a id="v1-7-2"></a>
## 1.7.2-HotFix — 10 Kasım 2026
`HotFix`

### Düzeltilenler
- Çıkış cihazı değiştirilince dalgaların kaybolması giderildi.

---

<a id="v1-7-1"></a>
## 1.7.1 — 10 Kasım 2026

### Değiştirilenler
- Bass algoritması iyileştirildi.

---

<a id="v1-7-0"></a>
## 1.7.0 — 10 Kasım 2026 · Spotify v1.0 Release

### Eklenenler ve İyileştirmeler

#### Spotify Video Arka Planı
- Müzik ve Sözler ekranlarının sağında artık Spotify'ın kısa video arka planları oynuyor. Kenarları yumuşak geçişli; bass vurunca video daha belirgin açılıyor. Şarkı duraklatılınca video yumuşakça gizleniyor, devam edince geri geliyor. Müzik ile Sözler arasında geçiş yapınca video baştan başlamıyor.

#### Spotify Çalma Listesi Menüsü
- Müzik ekranındaki Spotify simgesine tıklayınca çalma listeleri açılıyor; seçince çalıyor. Menü açılınca çentik yayla büyüyor, kapanınca eski hâline dönüyor.

#### Cihaz Seçimi Menüsü
- Çalma listesi menüsüyle aynı görünüme kavuştu.
- Tek cihaz olsa da açılıyor; liste her açılışta yenileniyor.
- Cihaz değiştirince çipte eski ad kalmıyor.
- Çalma listesi ve cihaz menüleri artık aynı anda açık kalmıyor.

#### Tek Şarkı Tekrarı
- Spotify'da tekrar tuşuna ikinci kez basınca "1" rozeti görünüyor.

#### Spotify Hata Mesajları
- Premium gerektirmeyen kısıtlamalarda artık yanlış "Premium gerekli" uyarısı çıkmıyor.

#### Yeni Spotify Ayarları
- Şarkı değiştirmeyi Spotify üzerinden veya Windows'un kendi medya kontrolleriyle yapma seçeneği. Windows modunda kapak, şarkı adı, süre ve video arka planı da Windows'tan geliyor.
- Çalma listelerini ve cihaz seçiciyi göster/gizle.
- Yeni videoları indirme aç/kapa. Kapalıyken internetten yeni video indirilmiyor; varsa diskteki video oynatılıyor.
- Sıradaki şarkıları önceden hazırlama ve kaç şarkı hazırlanacağını seçme. Açıkken sıradaki şarkıların videoları, kapakları ve sözleri arka planda hazırlanıyor.
- Video önbellek sınırı.
- Tüm yeni ayarlar için (i) açıklamaları ve 7 dilde çeviri.

#### Söz Arama
- Bir şarkı için en fazla 4 kez söz aranıyor.
- Bulunamazsa 48 saat boyunca aynı şarkı için tekrar tekrar ağa çıkılmıyor; sonuç doğrudan "bulunamadı" olarak gösteriliyor. Bu bilgi kalıcı tutuluyor.

#### Söz Bulunamayan Şarkılar
- Sağdaki söz alanı gizleniyor, soldaki şarkı bilgileri ve kontroller kalıyor; video arka planı sağda görünüyor.
- Söz bulunamazsa arka planda sessizce tekrar deneniyor, ekran "yükleniyor" görünümüne dönmüyor.

#### Söz Geçişleri
- Şarkı değişince eski sözler kapak ve şarkı bilgileriyle aynı anda sönüyor.
- Yeni sözler yüklenirken söz alanı boş kalıyor; sözler hazır olunca animasyonla geliyor.
- Aynı sözler gereksiz yere tekrar animasyonla yenilenmiyor.

#### Sözler Çentiği
- Sözler çentiği biraz daha büyütüldü; alt sayfa noktaları aşağı indi, kontrol düğmeleriyle çakışma azaldı.

#### Müzik İlerleme Çubuğu
- Video arka planı açılınca ilerleme çubuğu yayla kısalıyor ve artık yanlış yere sarma yapılmıyor.

#### Video Arka Planı Görünürlüğü
- Müzik ve Sözler ekranları aynı video kaynağını kullanıyor; video geç indirilirse sonradan otomatik görünüyor.

#### Ekran Süresi
- "Bugün" veya gün etiketine basınca geçmiş günleri gösteren şık bir takvim açılıyor; seçilen günün verileri görüntüleniyor.

#### Ayarlar
- Ayarlar kapatılıp yeniden açılınca son sekme ve kaydırma konumundan devam ediyor; artık "Genel"e dönmüyor.

#### Kayıt Dosyaları
- Uygulama logları her açılışta silinmiyor; önceki 3 açılışın kaydı ayrıca saklanıyor.

### Düzeltilenler
- Video arka planının hiç görünmemesi düzeltildi.
- Video arka planının Müzik ve Sözler arasında geçişte baştan başlaması ve geçişlerde takılması giderildi.
- Video arka planının duraklatınca tamamen kaybolması yerine yumuşakça gizlenmesi sağlandı; devam edince geri geliyor.
- Video arka planının sağ kenarında görünen ince yeşil çizgi giderildi.
- Bazı ekran geçişlerinde oluşan görsel bozulma düzeltildi.
- Cihaz menüsü açılınca çentiğin arkasının saydamlaşması giderildi; çentik her zaman normal görünüyor.
- Cihaz çipine ikinci kez basınca menünün kapanmaması düzeltildi.
- Cihaz değiştirdikten sonra çipte eski cihaz adının kalması düzeltildi.
- Söz bulunamayan video arka planlı şarkılarda çentiğin bazen daralmaması düzeltildi.
- Spotify'da şarkı duraklatılınca uygulamanın bunu geç fark etmesi ve oynat/duraklat düğmesinin gecikmesi giderildi.
- Spotify çalarken başka bir medya uygulamasına geçince Spotify ekranının takılı kalması düzeltildi.
- Spotify bağlantısı kapalıyken şarkı değiştirme, kapak ve süre bilgilerinin Windows medya kontrollerinden alınması sağlandı.
- Uzun süre söz araması yapılması ve gereksiz ağ trafiği azaltıldı.

---

<a id="v1-6-4"></a>
## 1.6.4 — 09 Kasım 2026

### Kaldırılanlar
- Custom Dock kaldırıldı; bir daha eklenmeyecek.

---

<a id="v1-6-3"></a>
## 1.6.3 — 09 Kasım 2026

### Eklenenler
- Güncelleme bölümüne **"Beta sürümlerini de dahil et"** seçeneği eklendi; beta özelliklerini erkenden test etmek isteyenler için.

---

<a id="v1-6-1"></a>
## 1.6.1 — 09 Kasım 2026

### Eklenenler ve İyileştirmeler
- **"Tam ekran davranışı"** ve **"Büyütme davranışı"** artık tamamen bağımsız iki ayar; biri diğerini ezmiyor.
- Tam ekran davranışına **"Minimal"** seçeneği eklendi: Auto / Küçült / Minimal / Gizle.
- **"Minimal açılma beklemesi"** ayarı eklendi (0.3 / 0.6 / 1.0 / 1.6 sn).
- Tekrar yaklaşma cezası 30 saniyeye ayarlandı; çentikten ayrıldıktan sonra 15 saniye içinde tekrar yaklaşılırsa çentik 30 saniye minimalde kalıyor.
- Çentik sağ tık menüsüne **"Minimal ceza: Açık/Kapalı"** satırı eklendi; ceza istenirse kapatılabiliyor.
- Sağ tık menüsü artık menü dışına tıklanınca kapanıyor.
- Tam ekran ve büyütme davranışı satırlarına (i) açıklamaları eklendi.
- Yaklaşma bölgesi 250 px'e ayarlandı; çentik fare yaklaşınca daha erken minimal çizgiye iniyor.
- Play/Pause geçişi hızlandırıldı (0.14 sn) ve dönme merkezi düzeltildi.
- Ayarlar kategorilerinin altındaki kırpma ve kararma giderildi; en alta kaydırıldığında son satır tamamen görünüyor.
- Tüm ayar (i) açıklamaları 7 dile çevrildi; bazı açıklamaların dil değişmesine rağmen İngilizce kalması düzeltildi.

---

<a id="v1-6-0"></a>
## 1.6.0 — 09 Kasım 2026

### Eklenenler ve İyileştirmeler
- Animasyon sistemi baştan yenilendi; hover, basış, açılış/kapanış ve geçişler artık aynı yumuşak hareket dilini kullanıyor.
- Sayfa geçişleri yönlü hale getirildi; içerik hedef sayfaya göre soldan veya sağdan kayarak geliyor ve hafif bir büyümeyle yerine oturuyor.
- Tüm ekranlarda buton, çip, toggle, segment, slider, menü, toast, tooltip, kart, liste satırı ve metin alanı aynı hover/basış/odak davranışına kavuştu.
- Play/Pause ikonları artık çapraz solma ve 90° dönmeyle değişiyor.
- Toggle topuzu basılıyken hafifçe uzuyor.
- Pano önizlemesindeki kapatma X'i fareyle üzerine gelince 90° dönüyor.
- Kopyalama bildirimi tek seferlik yumuşak bir "nabız" ile geri bildirim veriyor.
- Silme, ekleme ve kopyalama gibi işlemlerde geçişler daha akıcı ve tutarlı.
- Raf, Pano, Yapılacaklar ve Notlar boşken ikonlar hafifçe nefes alıyor; Yapılacaklar ve Notlar'a yönlendirici ikonlar eklendi.
- AI köprüsü kapalı veya hata durumundayken kırmızı durum noktası iki salınımlı yayla sallanıyor.
- Kapalı çentik, OSD ve pill ekranları tek bir düzene oturtuldu; açılış/kapanış ve içerik geçişleri daha tutarlı.
- Ses ve parlaklık çubuğu hover'da yumuşakça kalınlaşıyor; topuz animasyonlu beliriyor.
- OSD bildirimlerinde ikon hafif büyüyerek geliyor; uzun metinlerde çentik yatay olarak genişliyor.
- Müzik ekranındaki kontrol düğmeleri hover ve basış geri bildirimi kazandı; büyük çal düğmesi cam disk görünümüne kavuştu.
- Şarkı başlığı ve sanatçı değişiminde çapraz geçiş eklendi.
- Müzik ilerleme çubuğu ve dikey ses çubuğu ortak slider davranışına geçti; hover'da kalınlaşıyor.
- Sözler ekranındaki aktif satır vurgusu sadeleştirildi ve daha akıcı hale getirildi.
- Spotify cihaz çipi ve menüsünde yumuşak hover geçişleri eklendi.
- Home kartlarında yaylı hover ve kenar parlaması eklendi.
- Home widget'ları yeniden sıralanırken yumuşak yer değiştirme animasyonu eklendi.
- Home kaydırmasında kenarlarda lastik bant etkisi eklendi.
- Güncelleme rozeti ve boş durum animasyonları iyileştirildi.
- Ayarlar'daki adım düğmeleri ve özel sekmelerde hover/basış geri bildirimi eklendi.
- Spotlight arama alanı açılırken yumuşak genişleme animasyonu eklendi.
- Spotlight sekme çizgisi seçili sekmeye kayarak geçiyor.
- AI sohbet balonlarında giriş animasyonu ve kopyalama mikro-etkileşimi eklendi.
- Pano kartlarında yaylı hover ve seçim rozetinde hafif aşma efekti eklendi.
- Video kartlarında yaylı hover ve canlı kare önizlemesinde Ken Burns etkisi eklendi.
- Raf ekranında seçim, animasyonlu silme, seçim dikdörtgeni, çoklu sürükleme ve boş alan giriş animasyonu iyileştirildi.
- DropZone'da seçili çip halesi sadeleştirildi.
- Odak ekranında seans noktaları ve büyük sayaçta hane animasyonlu geri sayım eklendi.
- Su ekranındaki grafik ve halka geçişleri yaylı hale getirildi.
- Yapılacaklar'da tamamlama tiki ve satır hareketleri iyileştirildi.
- Takvim açılırken bulunduğu yerden büyüme animasyonu eklendi; seçili gün ve bekleyen görev noktaları belirginleştirildi.
- Stats grafiklerinde yaylı giriş animasyonu eklendi.
- Maskot göz kırpma ve bakış takibi korunarak çizim maliyeti düşürüldü; yüzen daire çizimi önbelleğe alındı.
- Menülerde tek tip yumuşak gölge ve daha tutarlı renk tonları kullanıldı.
- Sayısal metinlerde tabular rakamlar sayesinde süre/yüzde değişimlerinde genişlik zıplaması giderildi.
- Ayarlar iç boşlukları ve hizalamalar düzenlendi.
- "Animasyonları azalt" ve yüksek kontrast modları yeni animasyonlarla uyumlu hale getirildi.
- Fırça, gradyan, katman ve metin ölçüm önbellekleriyle animasyonlar sırasında kaynak kullanımı azaltıldı.
- Boşta CPU kullanımı düşürüldü; parlaklık yoklaması ve ortam animasyonları sınırlandı.
- Spotlight kapanışında oluşan siyah çentik hatası giderildi.
- Emoji ve sayı içeren metinlerde taşma/kırpılma sorunları için otomatik sığdırma iyileştirildi.

---

<a id="v1-5-6"></a>
## 1.5.6 — 07 Kasım 2026

### Değiştirilenler
- Performans iyileştirmeleri.

---

<a id="v1-5-5"></a>
## 1.5.5 — 07 Kasım 2026

### Değiştirilenler
- Performans iyileştirmeleri.

---

<a id="v1-5-4"></a>
## 1.5.4 — 07 Kasım 2026
`HotFix`

### Düzeltilenler
- Güncellemeyi sürekli indirip kurma sorunu giderildi.

---

<a id="v1-5-3-1"></a>
## 1.5.3.1 — 07 Kasım 2026
`HotFix`

### Değiştirilenler
- Güncelleme indirmesi artık pill değil, OSD ile gösteriliyor.

---

<a id="v1-5-3"></a>
## 1.5.3 — 07 Kasım 2026

### Düzeltilenler
- Dosya dönüştürücü araçlarının indirme sonrası otomatik kurulmaması sorunu tekrar giderildi.

### Değiştirilenler

#### Ayarlar
- Konum ve Sayfalar birleştirildi.
- Güncelleştirme ve Hakkında kısmı birleştirildi.
- Aktif kategori görünüşü biraz daha değiştirildi.
- Ayarlar kasma sorunu giderildi.

---

<a id="v1-5-0"></a>
## 1.5.0 — 07 Kasım 2026

### Eklenenler
- Çökme durumlarında artık ayrıntılı log kaydı tutuluyor; çökme nedeni (hata kodu, çağrı yığını, son işlemler) log dosyasına yazılıyor.

### Düzeltilenler
- Ayarlar penceresi açılırken yaşanan donma/kasma sorunu giderildi.
- Dosya dönüştürücü araçlarının indirme sonrası otomatik kurulmaması sorunu giderildi; araçlar artık indirme tamamlandığında kuruluyor.
- Windows 11'de "Windows ile başlat" seçeneği açık olmasına rağmen uygulamanın başlamaması sorunu giderildi (Windows 10 ile uyumlu başlangıç kaydı mekanizması Windows 11 ile uyumlu hale getirildi).
- Güncelleme indirme kısmında birkaç sorun giderildi.
- Türkçe karakter içeren veya OneDrive ile yönlendirilmiş kullanıcı profillerinde ayarlar, pano (clipboard) ve diğer kullanıcı verilerinin her açılışta silinmesi sorunu giderildi; yol/karakter kodlaması kaynaklı veri kaybı düzeltildi.
- YouTube Shorts/video oynatımı sırasında yaşanan çökme giderildi; sürekli şarkı sözü (lyrics) çekme isteklerinin yol açtığı çökme, istek sıklığı sınırlandırılarak ve hata durumları güvenli şekilde ele alınarak düzeltildi.
- Blur görseli oluştururken oluşan `CreateBitmap(blur image) failed 0x80070057` (geçersiz parametre) hatası giderildi; tam ekran/covering modu geçişlerinde blur görselinin tekrar tekrar ve hatalı parametrelerle oluşturulması engellendi (görsel önbelleğe alındı / geçersiz boyutlar doğrulandı).
- `screentime.json.tmp` dosyasına yazma hatası giderildi; geçici dosya yazımı ve atomik kaydetme mantığı düzeltildi, eşzamanlı yazma/kilit sorunları giderildi.

---

<a id="v1-4-0"></a>
## 1.4.0 — 06 Kasım 2026

### Değiştirilenler
- Dosya Dönüştürme dosyalarının indirildiği sunucu değişikliğe uğradı.

---

<a id="v1-3-3"></a>
## 1.3.3 — 06 Kasım 2026

### Düzeltilenler
- Spotlight AI inputunda **Shift + Enter** çalışmama sorunu giderildi.
- Dosya Dönüştürücü'de toggle kapatıldığında indirmenin durmaması sorunu giderildi.
- Dosya Dönüştürücü kapalı olmasına rağmen dosya indirmeye çalışma sorunu giderildi.

> 💌 *"Ve seni çok özledim <3"* — ANES

---

<a id="v1-3-2"></a>
## 1.3.2 — 06 Kasım 2026

### Değiştirilenler
- Performans iyileştirmeleri.

---

<a id="v1-3-1"></a>
## 1.3.1-HotFix — 06 Kasım 2026
`HotFix`

### Eklenenler
- FFMPEG kurulumu eklendi.

---

<a id="v1-3-0"></a>
## 1.3.0 — 06 Kasım 2026

### Eklenenler
- Dosya Dönüştürücü Release.

---

<a id="v1-2-4"></a>
## 1.2.4 — 06 Kasım 2026

### Eklenenler ve İyileştirmeler
- Drag & Drop tasarımları değişti.
- ANES Güncelleştirme ekranı artık tam Markdown destekliyor.
- ANES, güncellemeleri Intro bitmeden kontrol etmiyor.
- Tam ekran davranışı ayarlanabilir hale getirildi. **Varsayılan:** Fareyi götürene kadar çentik açık kalıyor; 15 saniye içinde tekrar götürülürse çentik 2 dakikalığına minimize oluyor.
- Dosya dönüştürme eklendi (BETA).
- Dosya dönüştürme için sağ tık menüsüne yeni **"Dönüştür"** kısmı eklendi.
- Ayarlardaki **"Su"** ve **"Odak"** kategorileri birleştirildi: **Sağlık**.

---

<a id="v1-2-0"></a>
## 1.2.0 — 06 Kasım 2026

### Eklenenler

#### Medya Kısayolları
- Çentiğe **CTRL** basılı tutarken:
  - **Sol tık:** Şarkıyı durdur / devam ettir.
  - **Sola kaydır:** Önceki şarkıya geç.
  - **Sağa kaydır:** Sonraki şarkıya geç.
  - **Scroll (tekerlek):** Ses düzeyini ayarla.
- Kısayollar çentik üzerinde çalışır; ekstra pencere açmadan hızlı kontrol sağlar.
- Mevcut medya kısayollarıyla çakışma olmaması için yalnızca CTRL basılıyken devreye girer.

#### Discord Rich Presence (RPC)
- Ayarlardan kapatılabilir; **varsayılan olarak açık**.
- Dinlenen medya bilgisi Discord profilinizde görünür.

#### Spotlight AI
- Artık geçmiş konuşmaları görebilir ve devam edebilirsiniz.
- Düşünceleri anlık olarak görebilirsiniz.
- Birkaç küçük tasarımsal değişiklik daha yapıldı.

### Düzeltilenler
- YouTube sekmesi kapatıldığında "arka planda çalıyor" hatası giderildi.
  - Sekme kapatıldıktan sonra medya durumunun yanlışlıkla "çalıyor" olarak algılanması düzeltildi.
  - Çentikte/medya kontrolünde hayalet "şu an çalıyor" göstergesi artık görünmüyor.
  - Arka plan medya algılama mantığı sekmeye özel hale getirildi; kapalı sekmeler takip edilmiyor.

---

<a id="v1-1-7"></a>
## 1.1.7 — 05 Kasım 2026

### Değiştirilenler
- AI köprüsünün sistem açılışında otomatik başlatılması eklendi.
- AI köprüsü için açma/kapatma butonu eklendi.
- Giriş/çıkış buton durumları düzenlendi.
- Sohbet ayarları **Gelişmiş** bölümüne taşındı.

---

<a id="v1-0-0"></a>
## 1.0.0 – 1.1.6 — 05 Kasım 2026

### Eklenenler, İyileştirmeler ve Düzeltmeler
- ANES'in ilk Open Beta sürümü yayınlandı.
- Intro ekranı yenilendi.
- Otomatik güncelleme desteği eklendi.
- Yazılım güncelleme ekranı geliştirildi.
- Performans iyileştirmeleri yapıldı.
- Yeni dil destekleri eklendi: `de`, `en`, `fa`, `fr`, `id`, `ru`, `tr`.
- İlk kurulum süreci güncellendi.
- Maskot değiştirildi.
- AI kurulumu sırasında Windows Store sahte Python alias'ının kullanılması engellendi.
- Çeşitli küçük düzenlemeler yapıldı.
