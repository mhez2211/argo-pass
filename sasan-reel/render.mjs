// Render frames with headless Chromium and encode with ffmpeg.
// usage: node render.mjs                 → full reel to out/sasan-inside-my-head.mp4
//        node render.mjs --frames 0,66,120 --sheet out/sheet.png [--debug]
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const debug = args.includes('--debug');
const sheet = opt('--sheet', null);
const TOTAL = 918;
let frames = opt('--frames', null);
frames = frames ? frames.split(',').flatMap(s => { const [a, b, st] = s.split(':').map(Number); if (b === undefined) return [a]; const o = []; for (let f = a; f <= b; f += (st || 1)) o.push(f); return o; }) : [...Array(TOTAL).keys()];
const outDir = path.join(here, 'out'), frameDir = path.join(outDir, sheet ? 'preview' : 'frames');
rmSync(frameDir, { recursive: true, force: true }); mkdirSync(frameDir, { recursive: true });

const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const workers = Math.min(4, frames.length);
let next = 0, done = 0;
const t0 = Date.now();
await Promise.all([...Array(workers)].map(async () => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  page.on('pageerror', e => { console.error('PAGE ERROR', e); process.exit(1); });
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto('file://' + path.join(here, 'index.html'));
  await page.evaluate(() => window.ready);
  while (next < frames.length) {
    const i = next++, f = frames[i];
    const url = await page.evaluate(([f, d]) => { renderFrame(f, { debug: d }); return document.getElementById('c').toDataURL('image/png'); }, [f, debug]);
    writeFileSync(path.join(frameDir, (sheet ? String(i) : String(f)).padStart(4, '0') + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    if (++done % 50 === 0) console.log(`${done}/${frames.length} frames, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  await page.close();
}));
await browser.close();

const ff = a => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a], { stdio: 'inherit' }); if (r.status) process.exit(r.status); };
if (sheet) {
  const cols = Math.min(6, frames.length), rows = Math.ceil(frames.length / cols);
  ff(['-framerate', '1', '-i', path.join(frameDir, '%04d.png'), '-vf', `scale=270:480,tile=${cols}x${rows}:padding=6:color=0x333333`, '-frames:v', '1', sheet]);
  console.log('sheet →', sheet);
} else {
  const mp4 = path.join(outDir, 'sasan-inside-my-head.mp4');
  ff(['-framerate', '30', '-i', path.join(frameDir, '%04d.png'), '-i', path.join(here, 'audio/narration.mp3'),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-tune', 'animation',
      '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', mp4]);
  console.log('video →', mp4, `(${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
