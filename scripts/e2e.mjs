// End-to-end test in real Chrome against a real local Ollama, plus raw UI screenshots.
// Usage: node scripts/e2e.mjs   (needs Chrome and Ollama with at least one chat model)
// Env: CHROME_PATH to override the browser; E2E_SKIP_SLOW=1 to skip the model-answer steps.
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const shots = join(root, 'store', 'raw');
mkdirSync(shots, { recursive: true });

const CHROME =
  process.env.CHROME_PATH ||
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome'
  ].find((p) => {
    try {
      return readFileSync(p) && true;
    } catch {
      return false;
    }
  });

// Test copy: grant the optional localhost permission up front (automation can't click the prompt).
const tmp = mkdtempSync(join(tmpdir(), 'chromy-e2e-'));
const extDir = join(tmp, 'extension');
cpSync(join(root, 'extension'), extDir, { recursive: true });
const manifest = JSON.parse(readFileSync(join(extDir, 'manifest.json'), 'utf8'));
manifest.host_permissions.push('http://localhost:11434/*', 'http://127.0.0.1:11434/*', 'https://example.com/*');
writeFileSync(join(extDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

/** Screenshot of the region spanning two elements (tight crops read well in store images). */
async function clipShot(page, fromSel, toSel, path, pad = 14) {
  const box = await page.evaluate(
    (a, b, p) => {
      const r1 = document.querySelector(a).getBoundingClientRect();
      const r2 = document.querySelector(b).getBoundingClientRect();
      const x = Math.min(r1.left, r2.left) - p;
      const y = Math.min(r1.top, r2.top) - p + scrollY;
      return { x, y, width: Math.max(r1.right, r2.right) + p - x, height: Math.max(r1.bottom, r2.bottom) + p + scrollY - y };
    },
    fromSel,
    toSel,
    pad
  );
  await page.screenshot({ path, clip: box, captureBeyondViewport: true });
}

const errors = [];
const results = [];
const ok = (name, detail = '') => {
  results.push(`✓ ${name}${detail ? ` (${detail})` : ''}`);
  console.log(results.at(-1));
};
// The public stats file only exists on GitHub after the release is pushed; a 404 for it is expected
// before that. Every other failed request or console error fails the run.
const STATS_URL = 'https://raw.githubusercontent.com/shatadip/Chromy-AI/main/stats/countries.json';
const notes = [];
const watch = (page, label) => {
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/.test(m.text()) && m.location()?.url === STATS_URL) return;
    errors.push(`${label}: ${m.text()} ${m.location()?.url || ''}`);
  });
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url() === STATS_URL) notes.push(`${label}: stats file not published yet (${r.status()})`);
  });
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  pipe: true,
  enableExtensions: [extDir],
  userDataDir: join(tmp, 'profile'),
  args: ['--no-first-run', '--no-default-browser-check', '--window-size=1280,800']
});

try {
  const sw = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'), { timeout: 15000 });
  const id = new URL(sw.url()).host;
  const url = (p) => `chrome-extension://${id}/${p}`;
  ok('extension loaded', id);

  // The install flow opens the welcome page by itself.
  const welcomeTarget = await browser.waitForTarget((t) => t.url() === url('welcome.html'), { timeout: 10000 });
  const welcome = await welcomeTarget.page();
  watch(welcome, 'welcome');
  await welcome.setViewport({ width: 1280, height: 800 });
  ok('welcome page opened on install');

  // With permission + Ollama + a model, steps 1-3 tick themselves and step 4 is active.
  await welcome.waitForSelector('#step3.done', { timeout: 20000 });
  const brain = await welcome.$eval('#brainDone', (e) => e.textContent);
  ok('setup steps auto-detected', brain.trim());
  await welcome.waitForFunction(() => document.querySelector('.globe-caption')?.textContent.length > 0, { timeout: 15000 });
  ok('globe rendered', await welcome.$eval('.globe-caption', (e) => e.textContent.slice(0, 60)));
  await welcome.screenshot({ path: join(shots, 'welcome.png') });

  if (!process.env.E2E_SKIP_SLOW) {
    const t = Date.now();
    await welcome.click('#tryIt');
    await welcome.waitForSelector('#finish:not([hidden])', { timeout: 300000 });
    ok('welcome "Try it" answered', `${((Date.now() - t) / 1000).toFixed(0)}s: ${(await welcome.$eval('#answer', (e) => e.textContent)).slice(0, 70).replace(/\n/g, ' ')}…`);
    await welcome.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
    await clipShot(welcome, '#step2', '#step4', join(shots, 'welcome-done.png'));
  }

  // Options: who answers + auto model.
  const options = await browser.newPage();
  watch(options, 'options');
  await options.setViewport({ width: 1280, height: 900 });
  await options.goto(url('options.html'));
  await options.waitForFunction(() => /Answering with/.test(document.getElementById('nowTitle').textContent), { timeout: 20000 });
  ok('options: engine detected', await options.$eval('#nowTitle', (e) => e.textContent));
  await options.waitForFunction(() => /Auto:/.test(document.querySelector('#ollamaModel option')?.textContent || ''), { timeout: 15000 });
  ok('options: model auto-chosen', await options.$eval('#ollamaModel option', (e) => e.textContent));
  // Auto-save round trip.
  await options.click('input[name="askStyle"][value="socrates"]');
  await new Promise((r) => setTimeout(r, 300));
  const style = await options.evaluate(async () => (await chrome.storage.local.get('settings')).settings.askStyle);
  if (style !== 'socrates') throw new Error('auto-save failed');
  await options.click('input[name="askStyle"][value="coach"]');
  ok('options: auto-save works');
  await options.evaluate(() => (document.getElementById('advanced').open = true));
  await options.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
  await clipShot(options, '.hero', '.hero + .card', join(shots, 'options.png'));

  // Popup (as a tab at popup size).
  const popup = await browser.newPage();
  watch(popup, 'popup');
  await popup.setViewport({ width: 410, height: 600, deviceScaleFactor: 2 });
  await popup.goto(url('popup.html'));
  await popup.waitForFunction(() => /Answering with/.test(document.getElementById('engineLine').textContent), { timeout: 20000 });
  ok('popup: engine line', await popup.$eval('#engineLine', (e) => e.textContent));
  await popup.screenshot({ path: join(shots, 'popup-empty.png') });

  if (!process.env.E2E_SKIP_SLOW) {
    await popup.evaluate(() => chrome.storage.local.set({ memory: [] }));
    await popup.type('#prompt', 'write a blog post about coffee');
    let t = Date.now();
    await popup.click('#send');
    await popup.waitForSelector('.msg.model:not(.typing) .msg-actions', { timeout: 300000 });
    const score = await popup.$eval('.msg.model .score .num', (e) => e.textContent).catch(() => 'no score line');
    ok('popup: Ask answered with score', `${((Date.now() - t) / 1000).toFixed(0)}s, score ${score}`);
    // Show the top of the answer (score meter) for the store screenshot.
    await popup.evaluate(() => {
      const t = document.getElementById('thread');
      const msgs = t.querySelectorAll('.msg.model');
      t.scrollTop = msgs[msgs.length - 1].offsetTop - t.offsetTop - 8;
    });
    await new Promise((r) => setTimeout(r, 1200)); // let the meter animate
    await popup.screenshot({ path: join(shots, 'popup-ask.png') });

    // A real question in Ask gets answered (not coached), and streaming doesn't rebuild the reply box.
    await popup.evaluate(() => {
      window.__flicker = { typingBoxes: 0, streamUpdates: 0 };
      new MutationObserver((muts) => {
        for (const m of muts) {
          for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList.contains('typing')) window.__flicker.typingBoxes++;
          if (m.target.nodeType === 1 && m.target.classList?.contains('stream')) window.__flicker.streamUpdates++;
        }
      }).observe(document.getElementById('thread'), { childList: true, subtree: true, characterData: true });
    });
    await popup.type('#prompt', 'What is thiamin? and why the lack of it cause problems in our body?');
    t = Date.now();
    await popup.click('#send');
    await popup.waitForFunction(() => !document.querySelector('.typing') && document.querySelectorAll('.msg.model').length >= 2, { timeout: 300000 });
    const q = await popup.evaluate(() => {
      const msgs = document.querySelectorAll('.msg.model');
      const last = msgs[msgs.length - 1];
      return {
        hasScore: !!last.querySelector('.score'),
        tip: last.querySelector('.tip')?.textContent || null,
        text: last.textContent.replace(/^CHROMY[^\n]*?qwen[^ ]*/i, '').slice(0, 160),
        switchBtn: [...last.querySelectorAll('.msg-actions button')].map((b) => b.textContent),
        flicker: window.__flicker
      };
    });
    if (q.hasScore || /^\s*(Verdict|Score)/i.test(q.text)) throw new Error(`question was coached, not answered: ${q.text}`);
    if (q.flicker.typingBoxes !== 1) throw new Error(`reply box rebuilt ${q.flicker.typingBoxes} times while streaming (flicker)`);
    if (!q.switchBtn.some((b) => /Coach this prompt/.test(b))) throw new Error('missing "Coach this prompt" switch');
    if (!q.tip) throw new Error('question answer has no 💡 prompt tip');
    ok('popup: question answered, no flicker', `${((Date.now() - t) / 1000).toFixed(0)}s, 1 reply box, ${q.flicker.streamUpdates} text updates, ${q.tip}`);
    console.log(`   answer: ${q.text.replace(/\s+/g, ' ').slice(0, 140)}…`);
    await popup.screenshot({ path: join(shots, 'popup-question.png') });

    // Socrates style.
    await popup.click('[data-style="socrates"]');
    await popup.type('#prompt', 'make me a logo');
    t = Date.now();
    await popup.click('#send');
    await popup.waitForFunction(() => document.querySelectorAll('.msg.model:not(.typing)').length >= 2 && !document.querySelector('.typing'), { timeout: 300000 });
    ok('popup: Socrates answered', `${((Date.now() - t) / 1000).toFixed(0)}s`);
    await new Promise((r) => setTimeout(r, 1000));
    await popup.screenshot({ path: join(shots, 'popup-socrates.png') });
    await popup.click('[data-style="coach"]');

    // Task on a real web page (tab id passed explicitly: the popup is itself a tab here).
    const site = await browser.newPage();
    await site.goto('https://example.com', { waitUntil: 'domcontentloaded' }).catch(() => null);
    const siteTitle = await site.title().catch(() => '');
    if (siteTitle) {
      t = Date.now();
      const res = await popup.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ url: 'https://example.com/*' });
        return chrome.runtime.sendMessage({ type: 'run', payload: { prompt: 'What is this page for? One sentence.', mode: 'task', usePage: true, tabId: tab.id } });
      });
      if (!res.ok) throw new Error(`page task failed: ${res.error}`);
      ok('task with "Use this page" on example.com', `${((Date.now() - t) / 1000).toFixed(0)}s: ${res.data.text.slice(0, 70)}`);
    } else ok('task with page skipped (no internet)');
    await site.close();

    // Repeat: starters.
    await popup.bringToFront();
    await popup.click('[data-mode="repeat"]');
    await popup.click('#addStarters');
    await popup.waitForSelector('.template-list li');
    ok('repeat: starter prompts added', `${await popup.$$eval('.template-list li', (l) => l.length)} prompts`);
    await popup.screenshot({ path: join(shots, 'popup-repeat.png') });

    // Dark mode shot.
    await popup.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await popup.click('[data-mode="ask"]');
    await new Promise((r) => setTimeout(r, 600));
    await popup.screenshot({ path: join(shots, 'popup-ask-dark.png') });
  }

  // The service worker must not have logged errors either.
  const swWorker = await sw.worker();
  swWorker?.on('console', (m) => m.type() === 'error' && errors.push(`sw: ${m.text()}`));

  if (errors.length) throw new Error(`console errors:\n  ${errors.join('\n  ')}`);
  ok('no console errors');
  if (notes.length) console.log(`note: ${[...new Set(notes)].join('; ')}`);
  console.log(`\nE2E PASSED (${results.length} checks). Screenshots in store/raw/`);
} catch (e) {
  console.error(`\nE2E FAILED: ${e.message}`);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  rmSync(tmp, { recursive: true, force: true });
}
