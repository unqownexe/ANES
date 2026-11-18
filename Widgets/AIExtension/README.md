# ANES Browser Agent (Chrome eklentisi)

Spotlight AI'nın aktif Chrome sekmesini okumasını ve kullanıcı onayıyla
yönetmesini sağlayan MV3 eklentisi. Eklentinin kendi AI anahtarı, modeli veya
ağ isteği yoktur; tüm planlama ANES içinde yapılır.

## Gereksinimler

- Windows 10/11, Chrome 116+
- ANES 1.1 (browser bridge ve native host dosyalarıyla birlikte)
- ANES > Ayarlar > AI > **Tarayıcı kontrolü** açık

## Kurulum

1. ANES'i açın: **Ayarlar > AI > Tarayıcı kontrolü**.
2. **Kur** düğmesine basın. Bu işlem:
   - `AIExtension\native-host\com.webtelya.anes.ai.json` manifestini yazar,
   - `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.webtelya.anes.ai`
     kaydını oluşturur.
3. **Eklenti klasörünü aç** düğmesiyle klasörü görün.
4. Chrome > `chrome://extensions` > **Geliştirici modu** > **Paketlenmemiş öğe
   yükle** > `AIExtension` klasörünü seçin.
5. Eklenti kimliği sabittir: `iakcbidfjppimplgjafglfolifgdgcpm`.
   Farklı bir kimlik görürseniz yanlış klasörü yüklemişsinizdir.

Native host'u elle derlemek/kaydetmek için:

```powershell
cd AIExtension\native-host
powershell -ExecutionPolicy Bypass -File register.ps1
```

Kaldırmak için:

```powershell
powershell -ExecutionPolicy Bypass -File unregister.ps1
```

## Nasıl çalışır?

```
Spotlight AI
   │  [[browser: hedef]]
   ▼
ANES browser agent (planlama, adım sayacı, onay)
   │  \\.\pipe\ANES_AI_Bridge  (yerel adlandırılmış boru)
   ▼
anes_native_host.exe  (stdio ↔ pipe aktarımı)
   │  Chrome native messaging
   ▼
Service worker ──► content script (aktif sekme)
```

- ANES kapalıyken boru yoktur; eklenti bağlanamaz, içerik betiği kaydetmez ve
  görev oluşturmaz. Popup **"ANES kapalı"** gösterir.
- **Tarayıcı kontrolü** kapalıyken ANES boruyu dinlemez, AI `[[browser:]]`
  etiketi üretmez; eklenti yine bağlanamaz.
- Boruya yalnız aynı kullanıcı bağlanabilir. İlk bağlantıda
  `%LOCALAPPDATA%\Webtelya\ANES\browser_bridge.token` içindeki rastgele token
  doğrulanır.
- Snapshot kimlikleri: içerik betiği `el-<n>`, service worker `f<frameId>-`
  öneki ekler. AI yalnız bu kimliklerle eylem ister.
- Riskli eylemler (form gönderimi, dosya yükleme, ödeme, silme vb.) ve manuel
  devam gereken durumlar ANES'te onay kartı gösterir. Onay olmadan eylem
  uygulanmaz.

## İzinler

| İzin | Neden |
| --- | --- |
| `nativeMessaging` | Yerel ANES köprüsüne bağlanmak |
| `scripting`, `activeTab`, `tabs` | Aktif sekmeye snapshot/eylem betiği |
| `storage` | Yerel ayar ve görev durumu |
| `alarms` | Service worker uyanıkken görev zaman aşımı |
| `webNavigation` | Sayfa yüklendiğinde snapshot tazeleme |
| `host_permissions` | Kullanıcının açık sekmelerinde çalışabilmek |

Eklenti hiçbir uzak sunucuya veri göndermez; `eval`, `new Function` veya uzaktan
kod yükleme kullanmaz. Tüm dosyalar düz JS/CSS/HTML'dir.

## Dosya düzeni

- `manifest.json` — MV3 tanımı ve sabit genel anahtar
- `background/` — native bridge, sayfa modeli, eylem yürütücü, görev durumu
- `content/` — DOM okuma, snapshot ve doğrulanmış eylemler
- `shared/` — sabitler, protokol ve doğrulama
- `popup/`, `options/` — durum ve ayar arayüzü
- `native-host/` — C++ stdio↔pipe aktarıcısı, kayıt betikleri
- `tools/` — ikon ve anahtar üretimi

## Güncelleme

Eklenti sürümü GitHub'daki `Widgets/AIExtension/version.json` ile karşılaştırılır.

- **Otomatik:** ANES açıkken (Tarayıcı kontrolü etkin) açılıştan 15 sn sonra ve
  30 dakikada bir kontrol edilir. Yeni sürüm varsa zip indirilir, `sha256`
  doğrulanır ve klasör güncellenir. Bağlantı varsa eklenti kendini yeniler
  (`ext_updated`).
- **Elle:** `update.bat` çift tıklanır. Ardından Chrome >
  `chrome://extensions` > **Yenile**.

`native-host\bin` ve `native-host\build` güncellemeyle silinmez; native host
gerekiyorsa `native-host\build_native_host.bat` ile ayrıca derlenir.

### Geliştirici: yeni sürüm yayınlama

1. `AIExtension` içinde değişiklikleri yapın.
2. `export.bat` çalıştırın; sürüm sorulur (boş = bir üst yama sürümü).
3. GitHub Desktop > **Commit to main** > **Push origin**.
4. `export.bat` şunları yazar: `Documents\GitHub\ANES\Widgets\AIExtension`
   klasörü, `downloads\AIExtension-<sürüm>.zip` ve `version.json`.

## Sorun giderme

- **"ANES kapalı"**: ANES'i açın ve Tarayıcı kontrolünü etkinleştirin.
- **"Eklenti bağlanamadı"**: `chrome://extensions` üzerinden eklentiyi yeniden
  yükleyin; Kur düğmesiyle kaydı tazeleyin.
- **Kimlik uyuşmuyor**: `manifest.json` içindeki `key` alanı silinmiş veya
  değiştirilmiş olabilir. Depodaki dosyayı kullanın.
- **Görev yarıda kaldı**: ANES'teki karttan **Durdur**'a basın; sayfa
  yenilendiyse görev otomatik sonlanır.
