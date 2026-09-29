// Renders Chrome Web Store images from store/promo/promo.html + the e2e screenshots in store/raw/.
// Usage: node scripts/e2e.mjs && node scripts/store-assets.mjs
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'store', 'screenshots');
mkdirSync(out, { recursive: true });
const CHROME =
  process.env.CHROME_PATH ||
  ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find(existsSync);

const JOBS = [
  ['1', 1280, 800, 'screenshot-1-score.png'],
  ['2', 1280, 800, 'screenshot-2-socrates.png'],
  ['3', 1280, 800, 'screenshot-3-local-ai.png'],
  ['4', 1280, 800, 'screenshot-4-keys.png'],
  ['5', 1280, 800, 'screenshot-5-repeat.png'],
  ['tile', 440, 280, 'promo-small-440x280.png'],
  ['marquee', 1400, 560, 'promo-marquee-1400x560.png']
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files'] });
try {
  const page = await browser.newPage();
  for (const [shot, w, h, file] of JOBS) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await page.goto(`${pathToFileURL(join(root, 'store', 'promo', 'promo.html')).href}?shot=${shot}`, { waitUntil: 'networkidle0' });
    const broken = await page.$$eval('img', (imgs) => imgs.filter((i) => !i.naturalWidth).map((i) => i.src));
    if (broken.length) throw new Error(`missing images for ${file}: ${broken.join(', ')} (run scripts/e2e.mjs first)`);
    await page.screenshot({ path: join(out, file), type: 'png' });
    console.log(`✓ ${file} (${w}×${h})`);
  }
} finally {
  await browser.close();
}
