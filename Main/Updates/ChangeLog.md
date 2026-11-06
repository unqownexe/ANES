# ANES - Changelog 

## 1.5.4 (07 Nov 2026)

Eklenenler:
  - Güncellemeyi sürekli indirip kurma sorunu giderildi - HotFix

## 1.5.3.1 (07 Nov 2026)

Eklenenler:
  - güncelleme indirmesi artık pill değil OSD

## 1.5.3 (07 Nov 2026)

Eklenenler:
  - Dosya dönüştürücü araçlarının indirme sonrası otomatik kurulmaması sorunu tekrar giderildi
  - Ayarlar Güncellemesi
    - Konum, Sayfalar birleştirildi.
    - Güncelleştirme ve Hakkında kısmı birleştirildi.
    - Aktif kategori görünüşü biraz daha değiştirildi.
    - Ayarlar kasma sorunu giderildi.
    

## 1.5.0 (07 Nov 2026)

Eklenenler:
  - Ayarlar penceresi açılırken yaşanan donma/kasma sorunu giderildi.
  - Dosya dönüştürücü araçlarının indirme sonrası otomatik kurulmaması sorunu giderildi; araçlar artık indirme tamamlandığında kuruluyor.
  - Çökme durumlarında artık ayrıntılı log kaydı tutuluyor; çökme nedeni (hata kodu, çağrı yığını, son işlemler) log dosyasına yazılıyor.
  - Windows 11'de "Windows ile başlat" seçeneği açık olmasına rağmen uygulamanın başlamaması sorunu giderildi (Windows 10 ile uyumlu başlangıç kaydı mekanizması Windows 11 ile uyumlu hale getirildi).
  - Güncelleme indirme kısmında birkaç sorun giderildi.
  - Türkçe karakter içeren veya OneDrive ile yönlendirilmiş kullanıcı profillerinde ayarlar, pano (clipboard) ve diğer kullanıcı verilerinin her açılışta silinmesi sorunu giderildi; yol/karakter kodlaması kaynaklı veri kaybı düzeltildi.
  - YouTube Shorts/video oynatımı sırasında yaşanan çökme giderildi; sürekli şarkı sözü (lyrics) çekme isteklerinin yol açtığı çökme, istek sıklığı sınırlandırılarak ve hata durumları güvenli şekilde ele alınarak düzeltildi.
  - Blur görseli oluştururken oluşan `CreateBitmap(blur image) failed 0x80070057` (geçersiz parametre) hatası giderildi; tam ekran/covering modu geçişlerinde blur görselinin tekrar tekrar ve hatalı parametrelerle oluşturulması engellendi (görsel önbelleğe alındı / geçersiz boyutlar doğrulandı).
  - `screentime.json.tmp` dosyasına yazma hatası giderildi; geçici dosya yazımı ve atomik kaydetme mantığı düzeltildi, eşzamanlı yazma/kilit sorunları giderildi.

## 1.4.0 (06 Nov 2026)

Eklenenler:
  - Dosya Dönüştürme dosyalarının indirildiği sunucu değişikliğe uğradı

## 1.3.3 (06 Nov 2026)

Eklenenler:

  - Spotlight AI inputunda Shift + Enter çalışmama sorunu giderildi
  - Dosya Dönüştürücü, dosyaları indirirken togglebox'u kapatırsa indirme durmuyordu, artık duruyor.
  - Ayrıca kapalı olmasına rağmen dosyaları indirmeye çalışıyordu, o giderildi
  - Ve seni cok ozledim <3

## 1.3.2 (06 Nov 2026)

Eklenenler:
  - Performans iyileştirmeleri

## 1.3.1-HotFix (06 Nov 2026)

Eklenenler:
  - FFMPEG Kurulumu eklendi

## 1.3.0 (06 Nov 2026)

Eklenenler:
  - Dosya Dönüştürücü Release

## 1.2.4 (06 Nov 2026)

Eklenenler:
  - Drag & Drop tasarımları değişti
  - ANES Güncelleştirme ekranı artık tam Markdown destekliyor
  - Artık ANES, güncellemeleri Intro bitmeden kontrol etmiyor
  - Bir uygulamayı tam ekran yapınca çentik direkt minimize oluyordu, artık ayarlardan bu özellik değiştirilebilir. / Varsayılan: Fareyi götürene kadar çentik açık kalıyor, 15 saniye içinde terkar götürülürse çentik 2 dakikalığına minimize oluyor.
  - Dosya dönüştürme eklendi (BETA)
  - Dosya dönüştürme için sağ tık menü için yeni "Dönüştür" kısmı eklendi
  - Ayarlardaki "Su, Odak" kategorileri birleştirildi; Sağlık

## 1.2.0 (06 Nov 2026)

- **1 adet yeni medya değiştirme kısayolu eklendi;**
  - Çentiğe (Notch) **CTRL** basılı tutarken:
    - **Sol tık:** Şarkıyı durdur / devam ettir,
    - **Sola kaydır:** Önceki şarkıya geç,
    - **Sağa kaydır:** Sonraki şarkıya geç,
    - **Scroll (tekerlek):** Ses düzeyini ayarla.
  - Kısayollar çentik üzerinde çalışır; ekstra pencere açmadan hızlı kontrol sağlar.
  - Mevcut medya kısayollarıyla çakışma olmaması için yalnızca CTRL basılıyken devreye girer.

- **YouTube sekmesi kapatıldığında "arka planda çalıyor" hatası giderildi;**
  - Sekme kapatıldıktan sonra medya durumunun yanlışlıkla "çalıyor" olarak algılanması düzeltildi,
  - Çentikte/medya kontrolünde hayalet "şu an çalıyor" göstergesi artık görünmüyor,
  - Arka plan medya algılama mantığı sekmeye özel hale getirildi; kapalı sekmeler takip edilmiyor.

- **Discord Rich Presence (RPC) eklendi;**
  - Ayarlardan kapatılabilir, **varsayılan olarak açık**,
  - Dinlenen medya bilgisi Discord profilinizde görünür.

- **Spotlight AI modu daha da geliştirildi** 
  - Artık geçmiş konuşmaları görebilir, devam edebilirsiniz.
  - Düşünceleri anlık olarak görebilirsiniz vs. vs. 
  - Birkaç küçük değişiklikler daha yapıldı, ufak tasarımsal.
  
## 1.1.7 (05 Nov 2026)

**Eklenenler ve İyileştirmeler:**
- AI köprüsünün sistem açılışında otomatik başlatılması eklendi.
- AI köprüsü için açma/kapatma butonu eklendi.
- Giriş/çıkış buton durumları düzenlendi.
- Sohbet ayarları Gelişmiş bölümüne taşındı.

## 1.0.0 – 1.1.6 (05 Nov 2026)

**Eklenenler, İyileştirmeler ve Düzeltmeler:**
- ANES'in ilk Open Beta sürümü yayınlandı.
- Intro ekranı yenilendi.
- Otomatik güncelleme desteği eklendi.
- Yazılım güncelleme ekranı geliştirildi.
- Performans iyileştirmeleri yapıldı.
- Yeni dil destekleri eklendi (de, en, fa, fr, id, ru, tr).
- İlk kurulum süreci güncellendi.
- Maskot değiştirildi.
- AI kurulumu sırasında Windows Store sahte Python alias'ının kullanılması engellendi.
- Çeşitli küçük düzenlemeler yapıldı.











