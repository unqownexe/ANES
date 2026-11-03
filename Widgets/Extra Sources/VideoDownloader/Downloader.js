#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ytdlp = process.env.ANES_YTDLP_PATH || path.join(here, 'yt-dlp.exe');
const outputDir = process.env.ANES_VIDEO_DIR || path.join(here, 'downloads');
const url = process.argv[2]?.trim();

if (!url || !/^https?:\/\//i.test(url)) {
  console.error('Usage: node NewDownloader.js <video-url>');
  process.exit(2);
}

mkdirSync(outputDir, { recursive: true });
const numbers = readdirSync(outputDir, { withFileTypes: true })
  .map((entry) => entry.name.match(/^(\d+)\s*-\s/))
  .filter(Boolean)
  .map((match) => Number(match[1]));
const index = (numbers.length ? Math.max(...numbers) : 0) + 1;
const quality = process.env.ANES_VIDEO_QUALITY || 'best';
const language = process.env.ANES_VIDEO_LANG || '';
const args = [
  '--no-playlist', '--newline', '--progress', '--no-warnings',
  '--progress-template', 'download:ANES_PROGRESS:%(progress._percent_str)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.eta)s',
  '--merge-output-format', 'mp4', '--recode-video', 'mp4', '--embed-thumbnail', '--add-metadata',
  '--print', 'before_dl:ANES_TITLE:%(title)s',
  '--print', 'after_move:ANES_FILE:%(filepath)s',
  '--output', path.join(outputDir, `${index} - %(uploader)s - %(title)s.%(ext)s`),
];
if (quality !== 'best') args.push('--format-sort', `res:${quality}`);
if (language) args.push('--format-sort', `lang:${language}`);
args.push(url);

const child = spawn(ytdlp, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', (chunk) => process.stdout.write(chunk));
child.stderr.on('data', (chunk) => process.stderr.write(chunk));
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('close', (code) => { process.exitCode = code ?? 1; });
