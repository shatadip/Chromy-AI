import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChrome } from './helpers.mjs';

const env = installChrome();
const S = await import('../extension/lib/store.js');
const F = await import('../extension/lib/fun.js');
const Gl = await import('../extension/lib/globe.js');
const { parseRegionCsv, splitCsvLine } = await import('../scripts/update-stats.mjs');

test('streaks: same day, next day, gap', () => {
  let s = S.nextStats(undefined, '2026-09-28');
  assert.deepEqual([s.sparks, s.streak], [1, 1]);
  s = S.nextStats(s, '2026-09-28');
  assert.deepEqual([s.sparks, s.streak], [2, 1]);
  s = S.nextStats(s, '2026-09-29');
  assert.deepEqual([s.sparks, s.streak, s.best], [3, 2, 2]);
  s = S.nextStats(s, '2026-10-05');
  assert.deepEqual([s.streak, s.best], [1, 2]);
  // Month boundary.
  assert.equal(S.nextStats({ lastDay: '2026-09-30', streak: 4 }, '2026-10-01').streak, 5);
});

test('memory keeps the last N turns', async () => {
  env.local.memory = [];
  for (let i = 0; i < 15; i++) await S.pushMemory([{ role: 'user', text: `u${i}` }, { role: 'model', text: `m${i}` }], 10);
  const m = await S.getMemory();
  assert.equal(m.length, 20);
  assert.equal(m[0].text, 'u5');
  await S.pushMemory([{ role: 'user', text: 'x' }], 0);
  assert.equal((await S.getMemory()).length, 0);
});

test('guessCountry: time zone first, then language region, else null', () => {
  assert.equal(F.guessCountry('Asia/Kolkata', ['en-US']), 'IN');
  assert.equal(F.guessCountry('Mars/Olympus', ['fr-CA', 'fr']), 'CA');
  assert.equal(F.guessCountry('Mars/Olympus', ['en']), null);
});

test('parseStats validates and sorts', () => {
  const r = F.parseStats({ countries: { IN: 50, US: 80, xx: 3, ZZZ: 4, FR: -1, DE: 'a', BR: 5 } });
  assert.deepEqual(r, [
    { code: 'US', count: 80 },
    { code: 'IN', count: 50 },
    { code: 'BR', count: 5 }
  ]);
  assert.deepEqual(F.parseStats(null), []);
});

test('share links are encoded; quotes include flagged misattributions', () => {
  const l = F.shareLinks('https://example.com/a b');
  assert.match(l.x, /url=https%3A%2F%2Fexample\.com%2Fa%20b/);
  assert.ok(F.QUOTES.some((q) => q.note && /never said/.test(q.note)));
  assert.equal(F.scoreLabel(95), 'Lightning ⚡');
  assert.equal(F.scoreLabel(10), 'Needs a jump-start');
});

test('globe projection: centre visible, antipode hidden; arcs hit both ends', () => {
  const c = Gl.project(20, 78, 78, 20);
  assert.ok(c.visible && Math.abs(c.x) < 1e-9 && Math.abs(c.y) < 1e-9);
  assert.equal(Gl.project(-20, -102, 78, 20).visible, false);
  const pts = Gl.arcPoints([22.9, 79.6], [39.5, -99.1], 20);
  assert.equal(pts.length, 21);
  assert.ok(Math.abs(pts[0].lat - 22.9) < 1e-6 && Math.abs(pts[20].lon + 99.1) < 1e-6);
  assert.ok(pts[10].lift > 1);
});

test('stats CSV: names or codes, quoted commas, summed rows', () => {
  assert.deepEqual(splitCsvLine('a,"b, c",d'), ['a', 'b, c', 'd']);
  const csv = '﻿Date,Region,Weekly users\n2026-09-01,India,"1,200"\n2026-09-01,US,300\n2026-09-02,India,100\n2026-09-02,Atlantis,5\n';
  const map = { India: 'IN' };
  assert.deepEqual(parseRegionCsv(csv, (n) => map[n]), { IN: 1300, US: 300 });
});
