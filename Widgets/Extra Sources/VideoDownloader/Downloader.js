
import ora from 'ora';
import chalk from 'chalk';
import readline from 'readline';
import { spawn, execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Sabitler
const YTDLP_PATH = path.join(__dirname, 'yt-dlp.exe');
///const DOWNLOADS_DIR = path.join(os.homedir(), 'Downloads', 'VideoDownloader');
const DOWNLOADS_DIR = path.join(__dirname, 'VideoDownloader');
const PLATFORM_PATTERNS = {
  youtube: /(?:youtube\.com|youtu\.be)/i,
  instagram: /instagram\.com/i,
  tiktok: /(?:tiktok\.com|vm\.tiktok\.com)/i,
};

// Renk Paleti
const c = {
  brand: chalk.hex('#FF0050').bold,
  success: chalk.hex('#00E676').bold,
  warn: chalk.hex('#FFD600'),
  error: chalk.hex('#FF5252').bold,
  info: chalk.hex('#40C4FF'),
  dim: chalk.hex('#B0BEC5'),
  white: chalk.white.bold,
  accent: chalk.hex('#CE93D8').bold,
};

function printBanner() {
  console.clear();
  console.log('');
  console.log(c.brand('  ╔══════════════════════════════════════════════╗'));
  console.log(c.brand('  ║') + c.white('   🎬  VIDEO INDIRICI  v2.0                   ') + c.brand('║'));
  console.log(c.brand('  ║') + c.info('   YouTube  •  Instagram  •  TikTok           ') + c.brand('║'));
  console.log(c.brand('  ╚══════════════════════════════════════════════╝'));
  console.log('');
  console.log(c.dim('  📁 Indirme klasoru: ') + c.info(DOWNLOADS_DIR));
  console.log('');
}

function detectPlatform(url) {
  for (const [name, pattern] of Object.entries(PLATFORM_PATTERNS)) {
    if (pattern.test(url)) return name;
  }
  return 'other';
}

function platformLabel(platform) {
  const labels = { youtube: '🔴 YouTube', instagram: '📸 Instagram', tiktok: '🎵 TikTok', other: '🌐 Diger' };
  return labels[platform] || labels.other;
}

function isValidUrl(str) {
  try {
    const url = new URL(str.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch { return false; }
}

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'settings.json'), 'utf8'));
  } catch {
    return {};
  }
}

function getRecordsFilePath() {
  const settings = loadSettings();
  const filename = settings.storage?.recordsFile || 'videolar.txt';
  return path.join(DOWNLOADS_DIR, filename);
}

function getNextIndex() {
  const recordsFile = getRecordsFilePath();
  const numbers = [];

  // 1) videolar.txt dosyasini tara
  if (fs.existsSync(recordsFile)) {
    try {
      const content = fs.readFileSync(recordsFile, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const m = line.trim().match(/^(\d+)\s*\|/);
        if (m) numbers.push(parseInt(m[1], 10));
      }
    } catch { }
  }

  // 2) DOWNLOADS_DIR klasorunu tara
  if (fs.existsSync(DOWNLOADS_DIR)) {
    try {
      const files = fs.readdirSync(DOWNLOADS_DIR);
      for (const file of files) {
        const m = file.match(/^(\d+)[\s\-_]/);
        if (m) numbers.push(parseInt(m[1], 10));
      }
    } catch { }
  }

  const maxNum = numbers.length > 0 ? Math.max(...numbers) : 0;
  return String(maxNum + 1).padStart(3, '0');
}

function checkExistingUrl(url) {
  const recordsFile = getRecordsFilePath();
  if (!fs.existsSync(recordsFile)) return null;

  try {
    const targetUrl = url.trim().toLowerCase();
    const content = fs.readFileSync(recordsFile, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length >= 2) {
        const idx = parts[0].trim();
        const recordedUrl = parts.slice(1).join('|').trim();
        if (recordedUrl.toLowerCase() === targetUrl) {
          return { index: idx, url: recordedUrl };
        }
      }
    }
  } catch { }
  return null;
}

function extractVideoId(url, platform) {
  try {
    const cleanUrl = url.trim().split('?')[0].replace(/\/+$/, '');
    if (platform === 'youtube') {
      const m1 = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      if (m1) return m1[1];
      const m2 = cleanUrl.match(/(?:youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/);
      if (m2) return m2[1];
    } else if (platform === 'instagram') {
      const m = cleanUrl.match(/\/(?:p|reel|reels)\/([a-zA-Z0-9_-]+)/);
      if (m) return m[1];
    } else if (platform === 'tiktok') {
      const m = cleanUrl.match(/\/video\/(\d+)/);
      if (m) return m[1];
      const mShort = cleanUrl.match(/vm\.tiktok\.com\/([a-zA-Z0-9_-]+)/);
      if (mShort) return mShort[1];
    }
  } catch { }
  return '';
}

function buildArgs(url, platform, index) {
  const outputTemplate = path.join(DOWNLOADS_DIR, `${index} - %(uploader)s - %(title)s.%(ext)s`);
  const base = [
    '--no-playlist', '--output', outputTemplate,
    '--merge-output-format', 'mp4',
    '--embed-thumbnail', '--add-metadata',
    '--no-warnings', '--newline',
    '--write-subs', '--write-auto-subs',
    '--sub-langs', 'tr,tr-TR',
    '--embed-subs', '--convert-subs', 'srt',
    '--print', 'after_move:filepath',
  ];
  const fmtYT = ['--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best', '--format-sort', 'lang:tr,res,fps'];
  const fmtIG = ['--format', 'best[ext=mp4]/best', '--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)'];
  const fmtTT = ['--format', 'best[ext=mp4]/best'];
  const fmtOT = ['--format', 'bestvideo[ext=mp4]+bestaudio/best', '--format-sort', 'lang:tr,res'];
  const fmt = platform === 'youtube' ? fmtYT : platform === 'instagram' ? fmtIG : platform === 'tiktok' ? fmtTT : fmtOT;
  return [...base, ...fmt, url.trim()];
}

async function downloadVideo(url, comments, index) {
  const platform = detectPlatform(url);
  console.log('');
  console.log(c.info('  🔗 Link     : ') + c.dim(url.length > 70 ? url.slice(0, 70) + '...' : url));
  console.log(c.info('  📡 Platform : ') + c.accent(platformLabel(platform)));
  console.log(c.info('  📌 Sira No  : ') + c.accent(`[${index}]`));
  console.log('');

  if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

  const args = buildArgs(url, platform, index);
  const infoSpinner = ora({ text: c.dim('Video bilgileri aliniyor...'), spinner: 'dots12', color: 'cyan' }).start();

  return new Promise((resolve) => {
    const proc = spawn(YTDLP_PATH, args, { windowsHide: true });
    let dlSpinner = null;
    let lastPct = '';
    let infoStopped = false;
    let resolvedFilePath = null;

    const stopInfo = (succeed = true) => {
      if (!infoStopped && infoSpinner.isSpinning) {
        infoStopped = true;
        succeed ? infoSpinner.succeed(c.success('Video bilgileri alindi')) : infoSpinner.stop();
      }
    };

    proc.stdout.on('data', (raw) => {
      const lines = raw.toString().split('\n');
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;

        // after_move:filepath ciktisini yakala
        if (t.includes('VideoDownloader') || fs.existsSync(t)) {
          if (!t.startsWith('[') && !t.includes('%')) {
            resolvedFilePath = t;
          }
        }

        if (t.startsWith('[info]')) stopInfo(true);

        if (t.startsWith('[download]')) {
          stopInfo(true);
          const m = t.match(/(\d+\.\d+)%\s+of\s+([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)\s+ETA\s+(\S+)/);
          if (m) {
            const [, pct, size, speed, eta] = m;
            const txt = `Indiriliyor  ${c.warn(pct + '%')}  ${c.dim('|')}  Boyut: ${c.info(size)}  ${c.dim('|')}  Hiz: ${c.success(speed)}  ${c.dim('|')}  ETA: ${c.accent(eta)}`;
            if (!dlSpinner) {
              dlSpinner = ora({ text: txt, spinner: 'line', color: 'yellow' }).start();
            } else if (pct !== lastPct) {
              dlSpinner.text = txt;
              lastPct = pct;
            }
          }
          if (t.includes('100%')) {
            if (dlSpinner?.isSpinning) { dlSpinner.succeed(c.success('Indirme tamamlandi!')); dlSpinner = null; }
          }
          if (t.includes('has already been downloaded')) {
            stopInfo(true);
            if (dlSpinner?.isSpinning) { dlSpinner.succeed(c.success('Zaten indirilmis!')); dlSpinner = null; }
            else ora({ text: '' }).succeed(c.success('Bu video zaten indirilmis!'));
          }
        }

        if (t.startsWith('[Merger]') || (t.startsWith('[ffmpeg]') && t.includes('Merging'))) {
          if (dlSpinner?.isSpinning) { dlSpinner.succeed(c.success('Indirme tamamlandi!')); dlSpinner = null; }
          const ms = ora({ text: c.dim('Video ve ses birlestiriliyor (ffmpeg)...'), spinner: 'dots', color: 'magenta' }).start();
          proc.on('close', () => { if (ms.isSpinning) ms.succeed(c.success('Birlestirme tamamlandi')); });
        }

        if (t.includes('[EmbedSubtitle]') || t.includes('Embedding subtitles')) {
          ora({ text: c.dim('Turkce altyazi ekleniyor...'), spinner: 'dots', color: 'blue' }).start()
            .succeed(c.success('Altyazi islendi'));
        }
      }
    });

    proc.stderr.on('data', () => { });

    proc.on('close', (code) => {
      if (infoSpinner.isSpinning) infoSpinner.stop();
      if (dlSpinner?.isSpinning) { dlSpinner.stop(); }
      console.log('');
      if (code === 0) {
        // Indirilen video dosyasini bul
        let videoFile = null;
        if (resolvedFilePath && fs.existsSync(resolvedFilePath)) {
          videoFile = resolvedFilePath;
        } else {
          // DOWNLOADS_DIR icinde `${index} - ` ile baslayan video dosyasini ara
          const videoExts = ['.mp4', '.mkv', '.webm', '.mov', '.avi'];
          const files = fs.readdirSync(DOWNLOADS_DIR);
          const match = files.find(f =>
            f.startsWith(`${index} - `) &&
            videoExts.some(ext => f.toLowerCase().endsWith(ext)) &&
            !f.endsWith('.part') && !f.endsWith('.ytdl') && !f.endsWith('.temp')
          );
          if (match) videoFile = path.join(DOWNLOADS_DIR, match);
        }

        const videoName = videoFile ? path.basename(videoFile) : `${index} - Video.mp4`;
        const baseName = videoFile ? path.parse(videoFile).name : `${index} - Video`;

        // 1) Yorumlari JSON olarak kaydet
        const settings = loadSettings();
        const shouldSaveJson = settings.storage?.saveCommentsJson !== false;
        let jsonFileName = null;
        if (shouldSaveJson) {
          const jsonPath = path.join(DOWNLOADS_DIR, `${baseName}.json`);
          const jsonPayload = {
            index,
            order: parseInt(index, 10),
            url,
            platform,
            videoId: extractVideoId(url, platform),
            videoFile: videoName,
            downloadedAt: new Date().toISOString(),
            commentCount: comments?.length || 0,
            comments: comments || []
          };
          fs.writeFileSync(jsonPath, JSON.stringify(jsonPayload, null, 2), 'utf8');
          jsonFileName = `${baseName}.json`;
        }

        // 2) videolar.txt dosyasina ekle
        const recordsFile = getRecordsFilePath();
        const recordLine = `${index} | ${url}\n`;
        fs.appendFileSync(recordsFile, recordLine, 'utf8');

        console.log(c.success('  ✅  Basariyla tamamlandi!'));
        console.log(c.dim('  🎬  Video    : ') + c.white(videoName));
        if (jsonFileName) {
          console.log(c.dim('  💬  Yorumlar : ') + c.accent(`${jsonFileName} (${comments?.length || 0} yorum)`));
        }
        console.log(c.dim('  📝  Kayit    : ') + c.info(`${path.basename(recordsFile)} -> ${index} | ${url}`));
        console.log(c.dim('  📁  Konum    : ') + c.dim(DOWNLOADS_DIR));
      } else {
        console.log(c.error(`  ❌  Hata (cikis kodu: ${code})`));
        console.log(c.warn('  💡  Ipuclari:'));
        console.log(c.dim('     • Private/kilitli icerikler indirilemez'));
        console.log(c.dim('     • Instagram icin oturum gerekebilir'));
        console.log(c.dim('     • Bolge kisitlamasi icin VPN deneyin'));
      }
      resolve(code === 0);
    });

    proc.on('error', (err) => {
      infoSpinner.fail(c.error('yt-dlp calistirilamadi!'));
      console.log(c.error('  ❌ ' + err.message));
      resolve(false);
    });
  });
}

async function promptLink(rl) {
  return new Promise((resolve) => {
    console.log(c.white('  🔗  Video linkini yapistirin:'));
    process.stdout.write(c.accent('  »  '));
    rl.once('line', (input) => resolve(input.trim()));
  });
}

async function promptYesNo(rl, questionText) {
  return new Promise((resolve) => {
    console.log(c.white(questionText));
    process.stdout.write(c.accent('  »  '));
    rl.once('line', (input) => resolve(['e', 'evet', 'y', 'yes'].includes(input.trim().toLowerCase())));
  });
}

async function promptContinue(rl) {
  console.log('');
  console.log(c.dim('  ──────────────────────────────────────'));
  return promptYesNo(rl, c.white('  Baska video indirilsin mi? ') + c.dim('[E/H]'));
}

async function main() {
  printBanner();

  if (!fs.existsSync(YTDLP_PATH)) {
    ora({ text: '' }).fail(c.error('yt-dlp.exe bulunamadi!'));
    console.log(c.warn('\n  Indirmek icin: https://github.com/yt-dlp/yt-dlp/releases'));
    console.log(c.dim('  Klasor: ' + __dirname));
    process.exit(1);
  }

  const checkSpinner = ora({ text: c.dim('yt-dlp kontrol ediliyor...'), spinner: 'dots', color: 'cyan' }).start();
  try {
    const ver = execSync(`"${YTDLP_PATH}" --version`, { encoding: 'utf8' }).trim();
    checkSpinner.succeed(c.success('yt-dlp ' + ver + ' hazir'));
  } catch {
    checkSpinner.warn(c.warn('yt-dlp versiyonu alinamadi'));
  }
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl.on('close', () => { console.log('\n' + c.dim('  Cikiliyor... Gorusuruz!')); process.exit(0); });
  process.on('SIGINT', () => rl.close());

  let running = true;
  while (running) {
    const url = await promptLink(rl);
    if (!url) {
      console.log(c.warn('\n  ⚠️   Bos link girdiniz.'));
    } else if (!isValidUrl(url)) {
      console.log('');
      console.log(c.error('  ❌  Gecersiz URL!'));
      console.log(c.dim('  Ornek: https://www.youtube.com/watch?v=...'));
    } else {
      // Daha once indirilmis mi kontrol et
      const existing = checkExistingUrl(url);
      if (existing) {
        console.log('');
        console.log(c.warn(`  ⚠️   Bu video daha once [${existing.index}] olarak indirilmis!`));
        console.log(c.dim(`      Kayitli link: ${existing.url}`));
        const reDownload = await promptYesNo(rl, '  Yine de tekrar indirilsin mi? [E/H]');
        if (!reDownload) {
          running = await promptContinue(rl);
          continue;
        }
      }

      const nextIndex = getNextIndex();

      // Browser.js/yorum çekme bu uygulamada kullanılmaz.
      await downloadVideo(url, [], nextIndex);
    }
    running = await promptContinue(rl);
  }

  rl.close();
  console.log('');
  console.log(c.success('  ✅  Program kapatildi. Iyi gunler! 👋'));
  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.error(chalk.red('Beklenmedik hata:'), err);
  process.exit(1);
});
