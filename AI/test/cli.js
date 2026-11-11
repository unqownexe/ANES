#!/usr/bin/env node
/**
 * ANES AI Backend — Terminal Sohbet Arayüzü
 * ==========================================
 * C:\...\APITEST\cli.js ile aynı arayüz/akış; ancak model alt süreçte değil,
 * yerel ANES AI Backend (http://127.0.0.1:8493) HTTP/SSE uç noktasında çalışır.
 *
 * Özellikler:
 *   - readline tabanlı terminal arayüzü (streaming)
 *   - Düşünme (thinking) metni GRI ve "┆" girintili gösterim
 *   - /think, /web ile modları aç/kapat
 *   - /cancel ile süren üretimi iptal etme
 *   - Araç çağrıları (search_news / web_search / open_url) mavi gösterim
 *   - Eksikleri tamamlayan: /search, /models, /load, /status, /stats
 *
 * Kullanım:
 *   node cli.js
 *   node cli.js --thinking --web
 *   node cli.js --port 8493 --once "10 Kasım ile ilgili son haberler"
 */

'use strict';

const http = require('node:http');
const readline = require('node:readline');

// ---------------------------------------------------------------------------
// Renkler / yardımcılar  (APITEST ile aynı palet)
// ---------------------------------------------------------------------------
let useColor = process.stdout.isTTY;
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s) => c('1', s);
// ANSI "faint" (2) Windows konsolunda gri göstermez; 256-renk paleti kullanılır.
const gray = (s) => c('38;5;245', s);
const dim = gray;
const cyan = (s) => c('36', s);
const green = (s) => c('32', s);
const yellow = (s) => c('33', s);
const red = (s) => c('31', s);
const magenta = (s) => c('35', s);
const blue = (s) => c('34', s);

const ASSISTANT_NAME = 'Gemma';

// ---------------------------------------------------------------------------
// Argüman ayrıştırma
// ---------------------------------------------------------------------------
function parseArgs(argv) {
    const opts = {
        host: process.env.ANES_HOST || '127.0.0.1',
        port: Number(process.env.ANES_PORT || 8493),
        model: null,
        temperature: null,
        topK: null,
        topP: null,
        maxTokens: null,
        system: null,
        thinking: null, // null => varsayılan (kapalı)
        web: null,
        verbose: false,
        noColor: false,
        showThinking: true,
        once: null,
    };
    const map = {
        '--host': 'host', '--port': 'port', '--model': 'model',
        '--temperature': 'temperature', '--top-k': 'topK', '--top-p': 'topP',
        '--max-tokens': 'maxTokens', '--system': 'system', '--once': 'once',
    };
    const numeric = ['port', 'temperature', 'topK', 'topP', 'maxTokens'];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '-v' || a === '--verbose') { opts.verbose = true; continue; }
        if (a === '--no-color') { opts.noColor = true; continue; }
        if (a === '--no-think-display') { opts.showThinking = false; continue; }
        if (a === '--thinking') { opts.thinking = true; continue; }
        if (a === '--no-thinking') { opts.thinking = false; continue; }
        if (a === '--web') { opts.web = true; continue; }
        if (a === '--no-web') { opts.web = false; continue; }
        if (a === '-h' || a === '--help') { opts.help = true; continue; }
        if (map[a]) {
            const key = map[a];
            const val = argv[++i];
            if (val === undefined) throw new Error(`${a} için değer gerekli`);
            opts[key] = numeric.includes(key) ? Number(val) : val;
        } else {
            throw new Error(`Bilinmeyen argüman: ${a}`);
        }
    }
    return opts;
}

function printHelp() {
    console.log(`${bold('Kullanım:')} node cli.js [seçenekler]

${bold('Seçenekler:')}
  --host <adres>            Sunucu adresi (varsayılan: 127.0.0.1)
  --port <n>                Sunucu portu (varsayılan: 8493)
  --model <ad>              Model tier/idsi
  --temperature <f>         Sıcaklık
  --top-k <n>               top-k (varsayılan: model)
  --top-p <f>               top-p (nucleus)
  --max-tokens <n>          Yanıt başına token sınırı
  --system "<metin>"        Sistem mesajı (ek)
  --thinking / --no-thinking   Düşünme modunu aç/kapat
  --web / --no-web                 Web aramasını aç/kapat
  --no-think-display        Düşünme metnini gösterme (yine de üretilir)
  --no-color                Renkleri kapat
  --once "<metin>"          Tek seferlik sorgu çalıştır ve çık
  -v, --verbose             Ham SSE olaylarını göster
  -h, --help                Bu yardımı göster`);
}

function printCommands() {
    console.log(dim('Komutlar: /help /think /web /think-display /reset /cancel /stats /set key=value /exit'));
    console.log(dim('  /think [on|off]  düşünme modu   /web [on|off]  web araması'));
    console.log(dim('  /search <sorgu>  doğrudan web arama   /models  /load <tier>  /status'));
    console.log(dim('  /standby  modeli bellekten çıkar   /idle [sn]  boşta boşaltma süresi'));
}

// ---------------------------------------------------------------------------
// Düşünme/yanıt akışı ayırıcı
//   Model düşünme metnini farklı işaretleyicilerle üretir; parçalar chunk
//   sınırında bölünse bile doğru ayırmak için arabellekli durum makinesi.
// ---------------------------------------------------------------------------
class ThinkSplitter {
    constructor() {
        this.buf = '';
        this.inThink = false;
        this.currentClose = null;
        this.pairs = [
            [' thinking', ''],
            ['<thought>', '</thought>'],
            ['<thinking>', '</thinking>'],
            // Gemma 4 (llama.cpp) düşünme kanalı: açılış "<|channel>thought",
            // kapanış "<channel|>".
            ['<|channel>thought', '<channel|>'],
            ['<|channel|>thought', '<channel|>'],
            ['<|think|>', '<channel|>'],
        ];
    }
    _maxOpenLen() {
        let m = 0;
        for (const [open] of this.pairs) m = Math.max(m, open.length);
        return m;
    }
    push(text) {
        this.buf += text;
        const out = [];
        for (; ;) {
            if (!this.inThink) {
                let idx = -1, found = null;
                for (const [open] of this.pairs) {
                    const i = this.buf.indexOf(open);
                    if (i !== -1 && (idx === -1 || i < idx)) { idx = i; found = open; }
                }
                if (idx === -1) {
                    const keep = this._maxOpenLen() - 1;
                    const emit = Math.max(0, this.buf.length - keep);
                    if (emit > 0) { out.push({ type: 'answer', text: this.buf.slice(0, emit) }); this.buf = this.buf.slice(emit); }
                    break;
                }
                if (idx > 0) out.push({ type: 'answer', text: this.buf.slice(0, idx) });
                this.buf = this.buf.slice(idx + found.length);
                this.inThink = true;
                this.currentClose = this.pairs.find((p) => p[0] === found)[1];
            } else {
                const i = this.buf.indexOf(this.currentClose);
                if (i === -1) {
                    const keep = this.currentClose.length - 1;
                    const emit = Math.max(0, this.buf.length - keep);
                    if (emit > 0) { out.push({ type: 'think', text: this.buf.slice(0, emit) }); this.buf = this.buf.slice(emit); }
                    break;
                }
                if (i > 0) out.push({ type: 'think', text: this.buf.slice(0, i) });
                this.buf = this.buf.slice(i + this.currentClose.length);
                this.inThink = false;
            }
        }
        return out;
    }
    flush() {
        const out = [];
        if (this.buf) out.push({ type: this.inThink ? 'think' : 'answer', text: this.buf });
        this.buf = '';
        return out;
    }
}

// ---------------------------------------------------------------------------
// HTTP + SSE
// ---------------------------------------------------------------------------
const agent = new http.Agent({ keepAlive: true, maxSockets: 4 });

function httpJson(opts, method, path, body) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const req = http.request({
            host: opts.host, port: opts.port, method, path, agent,
            headers: {
                'Content-Type': 'application/json',
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
            },
        }, (res) => {
            let out = '';
            res.setEncoding('utf8');
            res.on('data', (ch) => { out += ch; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, json: JSON.parse(out) }); }
                catch { resolve({ status: res.statusCode, raw: out }); }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

// ---------------------------------------------------------------------------
// Durum
// ---------------------------------------------------------------------------
const state = {
    thinking: false,
    web: false,
    showThinking: true,
    temperature: null,
    topK: null,
    topP: null,
    maxTokens: null,
    system: null,
    model: null,
    lastMetrics: null,
};

let opts;
let rl;
let busy = false;
let ready = false;
let currentId = 1;
let controller = null;
let gen = null; // aktif üretim: {id, thinkStarted, ansStarted, thinkBuf, ansBuf}
let lastThinking = '';
let onceResolve = null;
let onIdle = null;   // sohbet bitince çağrılır (pipe kapanışı için)

// ---------------------------------------------------------------------------
// Görsel
// ---------------------------------------------------------------------------
function statusLine() {
    const t = state.thinking ? green('açık  ') : yellow('kapalı');
    const w = state.web ? green('açık  ') : yellow('kapalı');
    const td = state.showThinking ? green('göster') : yellow('gizli ');
    return `  ${dim('Düşünme:')} ${t} ${dim('│ Web:')} ${w} ${dim('│ Gösterim:')} ${td}`;
}

function setPrompt() { if (ready && !busy) rl.setPrompt(magenta('Sen') + cyan(' › ')); }

// ---------------------------------------------------------------------------
// SSE olay işleme
// ---------------------------------------------------------------------------
function handleEvent(obj) {
    // ANES olayları
    if (obj.object === 'anes.event' && obj.anes) {
        const ev = obj.anes;
        if (ev.type === 'web' && ev.results) {
            process.stdout.write('\n' + blue('🌐 web arama sonuçları:') + '\n');
            ev.results.forEach((r, i) => {
                process.stdout.write(
                    blue(`   [${i + 1}] ${r.title || ''}`) +
                    dim(r.source ? `  (${r.source})` : '') + '\n'
                );
                if (r.url) process.stdout.write(dim(`       ${r.url}`) + '\n');
            });
        } else if (ev.type === 'tool') {
            const args = ev.arguments ? JSON.stringify(ev.arguments) : '{}';
            let summary = '';
            if (Array.isArray(ev.results) && ev.results.length) {
                summary = ev.results.slice(0, 3).map((r) => r.title).filter(Boolean).join('; ');
            }
            process.stdout.write(
                '\n' + blue(`🔎 ${ev.name}(${args})`) +
                (summary ? dim(` → ${summary}`) : '') + '\n'
            );
        } else if (ev.type === 'meta') {
            if (opts.verbose) process.stderr.write(dim(`[meta] model=${ev.model}\n`));
        }
        return;
    }

    if (obj.object === 'anes.error') {
        const msg = obj.error && obj.error.message;
        process.stdout.write('\n');
        console.error(red(`Hata: ${msg}`));
        finishGen();
        return;
    }

    const choice = obj.choices && obj.choices[0];
    if (!choice) return;
    const delta = choice.delta || {};

    if (delta.content) {
        for (const part of splitter.push(delta.content)) {
            if (part.type === 'think') onThinkingChunk(part.text);
            else onChunk(part.text);
        }
    }

    if (choice.finish_reason) {
        const usage = obj.usage;
        const metrics = obj.anes && obj.anes.metrics;
        finishGen({ usage, metrics });
    }
}

let splitter;

function onThinkingChunk(text) {
    if (!gen) return;
    gen.thinkBuf += text;
    if (!state.showThinking) return;
    if (!gen.thinkStarted) {
        gen.thinkStarted = true;
        process.stdout.write('\n' + gray('  ┆ ') + gray('🧠 düşünüyor...') + '\n');
        const t = text.replace(/\n(?=.)/g, '\n' + gray('  ┆ '));
        process.stdout.write(gray('  ┆ ') + gray(t));
    } else {
        const t = text.replace(/\n(?=.)/g, '\n' + gray('  ┆ '));
        process.stdout.write(gray(t));
    }
}

function onChunk(text) {
    if (!gen) return;
    if (!gen.ansStarted) {
        gen.ansStarted = true;
        if (gen.thinkStarted) process.stdout.write('\n');
        process.stdout.write('\n' + magenta(ASSISTANT_NAME) + cyan(' › '));
    }
    gen.ansBuf += text;
    process.stdout.write(text);
}

function finishGen(info) {
    if (!gen) return;
    for (const part of splitter.flush()) {
        if (part.type === 'think') onThinkingChunk(part.text);
        else onChunk(part.text);
    }
    if (!gen.ansStarted) {
        process.stdout.write('\n' + yellow('(boş yanıt)'));
    }
    process.stdout.write('\n');
    lastThinking = gen.thinkBuf || '';

    const parts = [];
    if (info && info.usage) {
        if (info.usage.completion_tokens != null) parts.push(`${info.usage.completion_tokens} token`);
    }
    if (info && info.metrics) {
        if (info.metrics.generation_time != null) parts.push(`${info.metrics.generation_time}s`);
        if (info.metrics.tokens_per_s != null) parts.push(`${info.metrics.tokens_per_s} tok/s`);
        state.lastMetrics = info.metrics;
    }
    if (lastThinking && state.showThinking) parts.push(dim('(/think-display ile düşünmeyi gizle)'));
    if (parts.length) console.log(dim(`  (${parts.join(' · ')})`));

    gen = null;
    busy = false;
    controller = null;
    if (onceResolve) { const r = onceResolve; onceResolve = null; r(); return; }
    if (onIdle) onIdle();
    setPrompt();
    rl.prompt();
}

// ---------------------------------------------------------------------------
// Sohbet gönderimi
// ---------------------------------------------------------------------------
function buildMessages(text) {
    const msgs = [];
    if (state.system) msgs.push({ role: 'system', content: state.system });
    msgs.push({ role: 'user', content: text });
    return msgs;
}

function sendChat(text) {
    const id = currentId++;
    gen = { id, thinkStarted: false, ansStarted: false, thinkBuf: '', ansBuf: '' };
    splitter = new ThinkSplitter();
    busy = true;

    const body = {
        model: state.model || undefined,
        messages: buildMessages(text),
        stream: true,
        include_stats: true,
        thinking: state.thinking,
        web_search: state.web,
    };
    if (state.temperature != null) body.temperature = state.temperature;
    if (state.topP != null) body.top_p = state.topP;
    if (state.topK != null) body.top_k = state.topK;
    if (state.maxTokens != null) body.max_tokens = state.maxTokens;

    controller = new AbortController();
    const data = JSON.stringify(body);

    const req = http.request({
        host: opts.host, port: opts.port, method: 'POST', path: '/v1/chat/completions',
        agent, signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
        if (res.statusCode >= 400) {
            let err = '';
            res.setEncoding('utf8');
            res.on('data', (ch) => { err += ch; });
            res.on('end', () => {
                process.stdout.write('\n');
                console.error(red(`Hata (HTTP ${res.statusCode}): ${err}`));
                finishGen();
            });
            return;
        }
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
            buf += chunk;
            let sep;
            while ((sep = buf.indexOf('\n\n')) !== -1) {
                const block = buf.slice(0, sep);
                buf = buf.slice(sep + 2);
                handleSseBlock(block);
            }
        });
        res.on('end', () => {
            if (buf.trim()) handleSseBlock(buf);
            if (gen) finishGen();
        });
    });

    req.on('error', (e) => {
        if (e.name === 'AbortError') {
            process.stdout.write('\n' + yellow('(iptal edildi)') + '\n');
        } else {
            process.stdout.write('\n');
            console.error(red(`Hata: ${e.message}`));
        }
        if (gen) finishGen();
    });

    req.write(data);
    req.end();
}

function handleSseBlock(block) {
    for (const line of block.split('\n')) {
        const s = line.trim();
        if (!s.startsWith('data:')) continue;
        const payload = s.slice(5).trim();
        if (payload === '[DONE]') continue;
        let obj;
        try { obj = JSON.parse(payload); } catch { continue; }
        if (opts.verbose) process.stderr.write(dim('[sse] ' + payload + '\n'));
        handleEvent(obj);
    }
}

// ---------------------------------------------------------------------------
// Komutlar
// ---------------------------------------------------------------------------
async function doSearch(query) {
    if (!query) { console.log(yellow('Kullanım: /search <sorgu>')); return; }
    try {
        const enc = encodeURIComponent(query);
        const { status, json } = await httpJson(opts, 'POST', `/v1/tools/web_search?query=${enc}&mode=web&max_results=5`);
        if (status >= 400) { console.error(red(`Arama hatası (HTTP ${status})`)); return; }
        console.log(blue(`🌐 '${query}' için ${json.count} sonuç:`));
        (json.results || []).forEach((r, i) => {
            console.log(blue(`  [${i + 1}] ${r.title || ''}`) + dim(r.source ? `  (${r.source})` : ''));
            if (r.snippet) console.log(dim(`      ${r.snippet}`));
            if (r.url) console.log(dim(`      ${r.url}`));
        });
    } catch (e) {
        console.error(red(`Arama başarısız: ${e.message}`));
    }
}

async function doModels() {
    try {
        const { status, json } = await httpJson(opts, 'GET', '/v1/models');
        if (status >= 400) { console.error(red(`HTTP ${status}`)); return; }
        console.log(bold('Modeller:'));
        (json.data || []).forEach((m) => {
            const dl = m.downloaded ? green('indirildi') : yellow('yok     ');
            console.log(`  ${cyan(String(m.tier).padEnd(12))} ${dl}  ${dim(m.filename || '')}`);
        });
        console.log(dim(`  Şu an yüklü: ${json.current_tier || '(yok)'}`));
    } catch (e) {
        console.error(red(`Liste alınamadı: ${e.message}`));
    }
}

async function doLoad(tier) {
    if (!tier) { console.log(yellow('Kullanım: /load <tier>')); return; }
    console.log(dim(`Model yükleniyor: ${tier} ...`));
    try {
        const { status, json } = await httpJson(opts, 'POST', `/v1/models/load?tier=${encodeURIComponent(tier)}&wait=true`);
        if (status >= 400) { console.error(red(json && json.detail ? json.detail : `HTTP ${status}`)); return; }
        state.model = tier;
        console.log(green(`Model yüklendi: ${tier}`));
    } catch (e) {
        console.error(red(`Yükleme başarısız: ${e.message}`));
    }
}

async function doStandby() {
    try {
        const { status, json } = await httpJson(opts, 'POST', '/v1/models/standby');
        if (status >= 400) { console.error(red(`HTTP ${status}`)); return; }
        if (json.status === 'standby') {
            console.log(green(`Model bellekten çıkarıldı (tier: ${json.tier}). Sonraki istekte otomatik yüklenecek.`));
        } else {
            console.log(yellow(`Standby uygulanamadı: ${json.status}`));
        }
    } catch (e) {
        console.error(red(`Standby başarısız: ${e.message}`));
    }
}

async function doIdle(seconds) {
    try {
        if (seconds === undefined) {
            const { json } = await httpJson(opts, 'GET', '/v1/config/idle');
            console.log(bold('Standby durumu:'));
            console.log(`  ${dim('Süre       :')} ${json.idle_timeout_s > 0 ? json.idle_timeout_s + 's' : 'kapalı'}`);
            console.log(`  ${dim('Yüklü      :')} ${json.loaded ? 'evet' : 'hayır'}`);
            console.log(`  ${dim('Boşta      :')} ${json.idle_seconds}s`);
            console.log(`  ${dim('Kalan      :')} ${json.seconds_until_standby != null ? json.seconds_until_standby + 's' : '-'}`);
            return;
        }
        const n = Number(seconds);
        if (!Number.isFinite(n) || n < 0) { console.log(yellow('Kullanım: /idle <saniye>  (0 => kapat)')); return; }
        const { json } = await httpJson(opts, 'POST', `/v1/config/idle?seconds=${n}`);
        console.log(green(`Standby süresi: ${n > 0 ? n + 's' : 'KAPALI'}`));
    } catch (e) {
        console.error(red(`Idle ayarı başarısız: ${e.message}`));
    }
}

async function doStatus() {
    try {
        const { status, json } = await httpJson(opts, 'GET', '/v1/status');
        if (status >= 400) { console.error(red(`HTTP ${status}`)); return; }
        const cpu = json.device && json.device.cpu;
        const mem = json.device && json.device.memory;
        const met = json.metrics || {};
        console.log(bold('Durum:'));
        console.log(`  ${dim('Model       :')} ${json.model.model_tier || '(yüklü değil)'}  ${dim(json.model.available ? 'motor hazır' : 'motor YOK')}`);
        if (cpu) console.log(`  ${dim('CPU         :')} ${cpu.usage_percent != null ? cpu.usage_percent + '%' : '-'}`);
        if (mem) console.log(`  ${dim('RAM         :')} ${mem.percent != null ? mem.percent + '%' : '-'}  ${dim((mem.used_human || '') + ' / ' + (mem.total_human || ''))}`);
        console.log(`  ${dim('İstekler    :')} ${met.total_requests || 0} ${dim('(başarısız: ' + (met.failed_requests || 0) + ')')}`);
        console.log(`  ${dim('Ort. tok/s  :')} ${met.avg_tokens_per_s != null ? met.avg_tokens_per_s : '-'}`);
    } catch (e) {
        console.error(red(`Durum alınamadı: ${e.message}`));
    }
}

async function handleCommand(line) {
    const [cmd, ...rest] = line.split(/\s+/);
    switch (cmd) {
        case '/help': {
            printCommands();
            console.log(dim('  /think [on|off]     → düşünme modunu aç/kapat'));
            console.log(dim('  /think-display      → düşünme metnini göster/gizle'));
            console.log(dim('  /web [on|off]       → web arama aracını aç/kapat'));
            console.log(dim('  /standby            → modeli şimdi bellekten çıkar (sonraki istekte otomatik yüklenir)'));
            console.log(dim('  /idle [saniye]      → boşta boşaltma süresini göster/ayarla (0 => kapat)'));
            console.log(dim('  /cancel             → süren yanıtı iptal et'));
            console.log(dim('  /set temperature=0.7 top_p=0.9 system="..." thinking=on web=on'));
            rl.prompt();
            break;
        }
        case '/think': {
            if (!ready) { console.log(yellow('Sunucu henüz hazır değil.')); rl.prompt(); break; }
            if (busy) { console.log(yellow('Yanıt sürerken değiştirilemez.')); rl.prompt(); break; }
            const arg = (rest[0] || '').toLowerCase();
            const on = ['on', 'aç', 'ac', 'açık', 'acik', 'true', '1'].includes(arg);
            const off = ['off', 'kapat', 'kapalı', 'kapali', 'false', '0'].includes(arg);
            state.thinking = on ? true : off ? false : !state.thinking;
            console.log(green(`Düşünme modu: ${state.thinking ? 'AÇIK' : 'KAPALI'}`));
            console.log(statusLine());
            rl.prompt();
            break;
        }
        case '/web': {
            if (!ready) { console.log(yellow('Sunucu henüz hazır değil.')); rl.prompt(); break; }
            if (busy) { console.log(yellow('Yanıt sürerken değiştirilemez.')); rl.prompt(); break; }
            const arg = (rest[0] || '').toLowerCase();
            const on = ['on', 'aç', 'ac', 'açık', 'acik', 'true', '1'].includes(arg);
            const off = ['off', 'kapat', 'kapalı', 'kapali', 'false', '0'].includes(arg);
            state.web = on ? true : off ? false : !state.web;
            console.log(green(`Web araması: ${state.web ? 'AÇIK' : 'KAPALI'}`));
            console.log(statusLine());
            rl.prompt();
            break;
        }
        case '/think-display': {
            state.showThinking = !state.showThinking;
            console.log(green(`Düşünme gösterimi: ${state.showThinking ? 'AÇIK' : 'KAPALI'}`) +
                dim('  (yalnızca görünüm; model düşünmeye devam eder)'));
            rl.prompt();
            break;
        }
        case '/cancel':
            if (controller) { controller.abort(); }
            else { console.log(dim('İptal edilecek aktif üretim yok.')); rl.prompt(); }
            break;
        case '/reset':
            console.log(green('Konuşma sıfırlandı (istemci geçmişi temizlendi).'));
            rl.prompt();
            break;
        case '/search':
            await doSearch(rest.join(' '));
            rl.prompt();
            break;
        case '/models':
            await doModels();
            rl.prompt();
            break;
        case '/load':
            await doLoad(rest[0]);
            rl.prompt();
            break;
        case '/status':
            await doStatus();
            rl.prompt();
            break;
        case '/standby':
            await doStandby();
            rl.prompt();
            break;
        case '/idle':
            await doIdle(rest[0]);
            rl.prompt();
            break;
        case '/stats':
            if (state.lastMetrics) console.log(dim(JSON.stringify(state.lastMetrics, null, 2)));
            else console.log(yellow('Henüz istek yapılmadı.'));
            rl.prompt();
            break;
        case '/set': {
            if (!ready) { console.log(yellow('Sunucu henüz hazır değil.')); rl.prompt(); break; }
            if (busy) { console.log(yellow('Yanıt sürerken ayar değiştirilemez.')); rl.prompt(); break; }
            for (const token of rest) {
                const m = token.match(/^([a-z_]+)=(.*)$/i);
                if (!m) { console.log(red(`Geçersiz: ${token}`)); continue; }
                let [, key, val] = m;
                if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
                switch (key.toLowerCase()) {
                    case 'temperature': state.temperature = Number(val); break;
                    case 'top_k': case 'topk': state.topK = Number(val); break;
                    case 'top_p': case 'topp': state.topP = Number(val); break;
                    case 'max_tokens': case 'max_output_tokens': state.maxTokens = Number(val); break;
                    case 'system': state.system = val; break;
                    case 'model': state.model = val; break;
                    case 'thinking': state.thinking = ['on', 'true', '1', 'açık', 'acik'].includes(val.toLowerCase()); break;
                    case 'web': state.web = ['on', 'true', '1', 'açık', 'acik'].includes(val.toLowerCase()); break;
                    default: console.log(red(`Bilinmeyen ayar: ${key}`));
                }
            }
            console.log(green('Ayarlar güncellendi: ') + dim(JSON.stringify({
                temperature: state.temperature, top_k: state.topK, top_p: state.topP,
                max_tokens: state.maxTokens, system: state.system, model: state.model,
                thinking: state.thinking, web: state.web,
            })));
            console.log(statusLine());
            rl.prompt();
            break;
        }
        case '/exit': case '/quit':
            rl.close();
            break;
        default:
            console.log(red(`Bilinmeyen komut: ${cmd}`));
            printCommands();
            rl.prompt();
    }
}

// ---------------------------------------------------------------------------
// Ana akış
// ---------------------------------------------------------------------------
async function main() {
    try {
        opts = parseArgs(process.argv.slice(2));
    } catch (e) {
        console.error(red(e.message));
        process.exit(2);
    }
    if (opts.help) { printHelp(); return; }
    if (opts.noColor) useColor = false;

    if (opts.thinking !== null) state.thinking = opts.thinking;
    if (opts.web !== null) state.web = opts.web;
    state.showThinking = opts.showThinking;
    state.temperature = opts.temperature;
    state.topK = opts.topK;
    state.topP = opts.topP;
    state.maxTokens = opts.maxTokens;
    state.system = opts.system;
    state.model = opts.model;

    // readline'i HEMEN kur; pipe girdisi health beklemesi sırasında kaybolmasın.
    const isTTY = !!process.stdout.isTTY && !!process.stdin.isTTY;
    rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: isTTY,
    });
    // TTY değilken istem (prompt) gürültüsünü sustur.
    if (!isTTY) {
        const _prompt = rl.prompt.bind(rl);
        rl.prompt = () => { };
        void _prompt;
    }

    const lineQueue = [];
    let draining = false;
    let healthDone = false;
    let closed = false;
    let saidBye = false;

    function sayByeOnce() {
        if (saidBye) return;
        saidBye = true;
        if (isTTY) console.log(dim('\nGörüşürüz.'));
    }

    function tryFinish() {
        if (!closed || draining || !healthDone || busy) return;
        sayByeOnce();
        process.exit(0);
    }

    async function processLine(raw) {
        const line = (raw || '').trim();
        if (!line) { rl.prompt(); return; }
        if (line === '/exit' || line === '/quit') { rl.close(); return; }
        if (line.startsWith('/')) { await handleCommand(line); return; }
        if (!ready) { console.log(yellow('Sunucu henüz hazır değil...')); rl.prompt(); return; }
        if (busy) { console.log(yellow('Yanıt üretiliyor... bitmesini bekleyin ya da /cancel yazın.')); rl.prompt(); return; }
        sendChat(line);
    }

    async function drain() {
        if (draining) return;
        draining = true;
        try {
            while (lineQueue.length) await processLine(lineQueue.shift());
        } finally {
            draining = false;
            tryFinish();
        }
    }

    rl.on('line', (raw) => {
        lineQueue.push(raw);
        if (healthDone) drain();
    });
    rl.on('SIGINT', () => { rl.close(); });
    rl.on('close', () => {
        closed = true;
        if (controller) controller.abort();
        tryFinish();
    });

    // Sunucu hazır mı?
    let health = null;
    try {
        const { json } = await httpJson(opts, 'GET', '/health');
        health = json;
        if (!json) throw new Error('boş yanıt');
        ready = true;
    } catch (e) {
        console.error(red(`Sunucuya bağlanılamadı (http://${opts.host}:${opts.port}): ${e.message}`));
        console.error(dim('İpucu: önce start.bat ile backend\'i başlatın.'));
        process.exit(1);
    }
    healthDone = true;

    if (opts.once) {
        banner(health);
        await new Promise((resolve) => {
            onceResolve = resolve;
            sendChat(opts.once);
        });
        process.exit(0);
    }

    banner(health);
    console.log(statusLine());
    console.log();
    printCommands();
    console.log();
    setPrompt();
    onIdle = () => { if (closed) tryFinish(); };

    // Pipe'tan gelen birikmiş komutları işle, sonra istemi göster.
    await drain();
    if (!closed) rl.prompt();
}

function banner(health) {
    console.log();
    console.log(bold(cyan('  ╭─────────────────────────────────────────────╮')));
    console.log(bold(cyan('  │   ANES · llama.cpp · Terminal Sohbet         │')));
    console.log(bold(cyan('  ╰─────────────────────────────────────────────╯')));
    console.log(`  ${dim('Sunucu   :')} http://${opts.host}:${opts.port}`);
    console.log(`  ${dim('Model    :')} ${state.model || (health && health.model_tier) || '(varsayılan)'}`);
    console.log(`  ${dim('Motor    :')} ${health && health.engine_available ? green('hazır') : red('YOK')}`);
    console.log(`  ${dim('Durum    :')} ${health && health.model_loaded ? green('model yüklü') : yellow('model yüklü değil')}`);
    console.log();
}

main().catch((e) => {
    console.error(red(e.stack || String(e)));
    process.exit(1);
});
