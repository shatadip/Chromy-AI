// Static release checks for the extension (also run by the test suite and CI).
// Usage: node scripts/check.mjs   → exits 1 with a list of problems.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ext = join(root, 'extension');

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

export function runChecks() {
  const problems = [];
  const manifestText = readFileSync(join(ext, 'manifest.json'), 'utf8');
  if (manifestText.charCodeAt(0) === 0xfeff) problems.push('manifest.json starts with a UTF-8 BOM (save without BOM)');
  const manifest = JSON.parse(manifestText.replace(/^﻿/, ''));
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

  if (manifest.manifest_version !== 3) problems.push('manifest_version must be 3');
  if (manifest.version !== pkg.version) problems.push(`manifest version ${manifest.version} != package.json ${pkg.version}`);
  if (manifest.name.length > 75) problems.push('name longer than 75 chars');
  if (manifest.description.length > 132) problems.push(`description is ${manifest.description.length} chars (max 132)`);

  // Every file the manifest references exists.
  const refs = [
    manifest.action?.default_popup,
    manifest.options_page,
    manifest.background?.service_worker,
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {})
  ].filter(Boolean);
  for (const r of refs) if (!existsSync(join(ext, r))) problems.push(`manifest references missing file: ${r}`);

  const files = walk(ext);
  for (const f of files) {
    const rel = relative(ext, f).replace(/\\/g, '/');
    const src = extname(f) === '.png' ? '' : readFileSync(f, 'utf8');
    if (extname(f) === '.html') {
      // Only local scripts/styles (no remote code), and every local reference exists.
      for (const m of src.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)) {
        if (/^(https?:)?\/\//.test(m[1])) problems.push(`${rel}: remote resource ${m[1]}`);
        else if (!existsSync(join(ext, m[1]))) problems.push(`${rel}: missing ${m[1]}`);
      }
      if (/<script(?![^>]*src=)[^>]*>/.test(src)) problems.push(`${rel}: inline <script> (blocked by CSP)`);
      if (/\son[a-z]+="/i.test(src)) problems.push(`${rel}: inline event handler (blocked by CSP)`);
    }
    if (extname(f) === '.js') {
      if (/\.innerHTML\s*=|insertAdjacentHTML|document\.write\(/.test(src)) problems.push(`${rel}: unsafe HTML injection API`);
      if (/\beval\(|new Function\(/.test(src)) problems.push(`${rel}: eval/new Function`);
      for (const m of src.matchAll(/from\s+'(\.[^']+)'/g)) {
        if (!existsSync(join(f, '..', m[1]))) problems.push(`${rel}: import of missing ${m[1]}`);
      }
      for (const m of src.matchAll(/getElementById\('([^']+)'\)|\$\('([^']+)'\)/g)) {
        const id = m[1] || m[2];
        if (id.includes('${')) continue;
        const page = { 'popup.js': 'popup.html', 'options.js': 'options.html', 'welcome.js': 'welcome.html' }[rel];
        if (page && !readFileSync(join(ext, page), 'utf8').includes(`id="${id}"`)) problems.push(`${rel}: #${id} not found in ${page}`);
      }
    }
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const problems = runChecks();
  if (problems.length) {
    console.error(`✗ ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log('✓ extension checks passed');
}
