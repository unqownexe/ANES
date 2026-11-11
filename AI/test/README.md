# ANES AI Backend · Node.js CLI Test İstemcisi

Yerel **ANES AI Backend** sunucusu (`http://127.0.0.1:8493`) için interaktif
terminal test aracı. Yalnızca **Node.js yerleşik modüllerini** (`http`,
`readline`) kullanır — hiçbir npm bağımlılığı yoktur, `npm install` gerekmez.

## Özellikler

- 🖥️ **readline tabanlı interaktif terminal** — akışlı (streaming) yanıt
- 🧠 **Düşünme (thinking) gösterimi** — muhakeme metni **gri** ve `┆` girintili;
  `/think on|off`, `/think-display` ile tam kontrol
- 🌐 **Web araması aç/kapat** — `/web on|off`; araç çağrıları mavi gösterilir
- 🔎 **Doğrudan web arama testi** — `/search <sorgu>` (modeli kullanmadan)
- 📊 **İstatistikler** — token sayısı, süre, tok/s
- 📦 **Model yönetimi** — `/models`, `/load <tier>`
- 💤 **Standby (boşta boşaltma)** — `/standby` ile anında, ya da `/idle <sn>` ile
  zamanlayıcılı: model boşta bellekten çıkar, sonraki istekte otomatik geri yüklenir
- ⚙️ **Çalışma anında ayar** — `/set temperature=0.7 top_k=40 ...`
- 📈 **Sunucu durumu** — `/status` (CPU/RAM/istek metrikleri)

## Önkoşullar

- **Node.js** ≥ 18
- Çalışan **ANES AI Backend** (önce `start.bat` ile başlatın)

## Çalıştırma

```bat
start.bat
```

veya doğrudan:

```bat
node cli.js
node cli.js --thinking --web
node cli.js --port 8493 --once "10 Kasım ile ilgili son haberleri ver"
```

## Komut satırı seçenekleri

| Seçenek | Varsayılan | Açıklama |
|---------|-----------|----------|
| `--host <adres>` | `127.0.0.1` | Sunucu adresi |
| `--port <n>` | `8493` | Sunucu portu |
| `--model <ad>` | — | Model tier/idsi |
| `--temperature <f>` | — | Sıcaklık |
| `--top-k <n>` | — | top-k örnekleme |
| `--top-p <f>` | — | top-p (nucleus) |
| `--max-tokens <n>` | — | Yanıt token sınırı |
| `--thinking` / `--no-thinking` | kapalı | Başlangıç düşünme modu |
| `--web` / `--no-web` | kapalı | Başlangıç web araması |
| `--no-think-display` | kapalı | Düşünme metnini gösterme |
| `--no-color` | kapalı | Renkleri kapat |
| `--once "<metin>"` | — | Tek seferlik sorgu çalıştır ve çık |
| `-v, --verbose` | kapalı | Ham SSE olaylarını göster |
| `-h, --help` | — | Yardım |

## Sohbet içi komutlar

| Komut | Açıklama |
|-------|----------|
| `/think [on\|off]` | Düşünme modunu aç/kapat (argümansız: tersine çevir) |
| `/web [on\|off]` | Web aramasını aç/kapat (argümansız: tersine çevir) |
| `/think-display` | Düşünme metnini göster/gizle (yalnızca görünüm) |
| `/search <sorgu>` | Modeli kullanmadan doğrudan web arama testi |
| `/models` | Katalog + indirilmiş modeller |
| `/load <tier>` | Model yükle |
| `/standby` | Modeli şimdi bellekten çıkar (sonraki istekte otomatik yüklenir) |
| `/idle [sn]` | Boşta boşaltma süresini göster/ayarla (`0` => kapat) |
| `/status` | Cihaz + metrik durumu |
| `/stats` | Son istek istatistikleri |
| `/set key=value ...` | Ayar değiştir |
| `/reset` | Konuşma geçmişini temizle |
| `/exit` | Çıkış |

`/set` anahtarları: `temperature`, `top_k`, `top_p`, `max_tokens`,
`model`, `thinking` (on/off), `web` (on/off)

Örnek:

```
/set temperature=0.7 top_k=40 system="Sen Türkçe konuşan bir asistansın"
```

## Çıktı örneği

```
  Düşünme: açık   │ Web: açık   │ Gösterim: göster

Sen › 10 Kasım ile ilgili güncel haberleri sun.

  ┆ 🧠 düşünüyor...
  ┆ Kullanıcı 10 Kasım ile ilgili güncel haberleri istiyor. search_news
  ┆ aracını çağırmalıyım...
🔎 search_news({"query":"10 Kasım","when":"day"}) → SOLOTÜRK saygı uçuşu - Anadolu Ajansı

ANES › 11 Kasım 2026 itibarıyla, 10 Kasım Atatürk'ü Anma Günü ile ilgili
       son gelişmeler şu şekildedir: ...
  (prompt 145 tok · yanıt 312 tok · 42.3 tok/s · 8.12s)
```

## Standby (boşta boşaltma)

Sunucudaki model sabit ~1.4 GB RAM tutar. İstek gelmediğinde bunu serbest
bırakmak için **standby** vardır:

- **Otomatik:** `ANES_IDLE_TIMEOUT` (varsayılan `300` sn) boyunca istek
  gelmezse model bellekten çıkarılır; yeni istek gelince **otomatik** geri
  yüklenir (~1.2 sn).
- **Elle:** `POST /v1/models/standby` veya CLI'de `/standby`.
- **Süre ayarı:** `POST /v1/config/idle?seconds=<n>` veya `/idle <n>`
  (`0` => standby kapalı).

| An | RAM (RSS) |
|----|-----------|
| Model yüklü (boşta) | ~1.4 GB |
| Standby (boşaltılmış) | ~72 MB |
| İstek sonrası (otomatik geri yüklendi) | ~1.3 GB |

## Teknik notlar

- **SSE ayrıştırma:** Yanıt `data: {json}\n\n` satırları olarak akar. Normal
  içerik `chat.completion.chunk`, ANES olayları (`meta`/`web`/`tool`) ise
  `anes.event` nesnesi olarak gelir; istemci ikisini de işler.
- **Düşünme ayrımı (güncel):** Gemma 4 (llama.cpp) düşünme metnini
  `<|channel>thought ... <channel|>` işaretleyicileriyle üretir; backend
  `thinking:true` isteğinde şablona `enable_thinking=True` iletir. Model
  düşünme metnini farklı işaretleyicilerle de üretebilir
  (` thinking...<｜end▁of▁thinking｜>`, `<thought>...</thought>`, `<|channel>thought...`).
  `ThinkSplitter` sınıfı, parçalar chunk sınırında bölünse bile bu metni doğru
  ayırıp gri olarak yazar.
- **Renkler:** Windows konsolu ANSI "faint" (2) kodunu göstermediği için gri
  için 256-renk paletinden (245) yararlanılır.
- **Bağımlılık yok:** Yalnızca `http` ve `readline`.
