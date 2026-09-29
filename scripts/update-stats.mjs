// Turns the Chrome Web Store dashboard's "users by region" CSV export into stats/countries.json,
// which the globe fetches. Only aggregate per-country totals are published.
// Usage: node scripts/update-stats.mjs path/to/export.csv
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** Splits one CSV line, honouring double quotes. */
export function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q && ch === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
    } else if (ch === '"') q = !q;
    else if (ch === ',' && !q) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/**
 * Pure: CSV text → { ISO2: count }. Finds the region/country column and the users/installs column
 * (or the last numeric one); accepts country names or 2-letter codes; sums duplicate rows
 * (e.g. one row per day).
 * @param {string} csv
 * @param {(name: string) => string | undefined} toAlpha2
 */
export function parseRegionCsv(csv, toAlpha2) {
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return {};
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const rows = lines.slice(1).map(splitCsvLine);
  const regionCol = header.findIndex((h) => /region|country/.test(h));
  let countCol = header.findIndex((h) => /users|installs|count|total/.test(h));
  if (countCol === -1) {
    countCol = header.length - 1;
    while (countCol > 0 && !rows.every((r) => /^[\d,.\s]*$/.test(r[countCol] || ''))) countCol--;
  }
  if (regionCol === -1 || countCol === -1) throw new Error('Could not find region and count columns.');

  const totals = {};
  for (const r of rows) {
    const region = (r[regionCol] || '').trim();
    const n = Number(String(r[countCol] || '').replace(/[,\s]/g, ''));
    if (!region || !Number.isFinite(n) || n <= 0) continue;
    const code = /^[A-Za-z]{2}$/.test(region) ? region.toUpperCase() : toAlpha2(region);
    if (code) totals[code] = (totals[code] || 0) + n;
  }
  return totals;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('update-stats.mjs')) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/update-stats.mjs export.csv');
    process.exit(1);
  }
  const iso = require('i18n-iso-countries');
  const countries = parseRegionCsv(readFileSync(file, 'utf8'), (name) => iso.getAlpha2Code(name, 'en'));
  const out = {
    updated: new Date().toISOString().slice(0, 10),
    source: 'Chrome Web Store developer dashboard, users by region (aggregate). Chromy AI itself collects no data.',
    countries
  };
  writeFileSync(new URL('../stats/countries.json', import.meta.url), `${JSON.stringify(out, null, 2)}\n`);
  console.log(`${Object.keys(countries).length} countries written to stats/countries.json. Commit and push to update the globe.`);
}
