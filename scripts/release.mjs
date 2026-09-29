// One-command release: bump version → changelog → tests → commit → push main (+ fast-forward dev).
// The "Release" GitHub Action then builds, creates the GitHub Release and publishes to the
// Chrome Web Store, and store installs update themselves.
// Usage: npm run release            (patch: 1.2.1 → 1.2.2)
//        npm run release -- minor   (1.2.1 → 1.3.0)
//        npm run release -- major   (1.2.1 → 2.0.0)
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function bumpVersion(version, kind = 'patch') {
  const [maj, min, pat] = version.split('.').map(Number);
  if ([maj, min, pat].some((n) => !Number.isInteger(n))) throw new Error(`Bad version ${version}`);
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  if (kind === 'patch') return `${maj}.${min}.${pat + 1}`;
  throw new Error(`Unknown bump "${kind}" (use patch, minor or major)`);
}

/** Replaces the top-level "version" in a JSON text without reformatting the file. */
export function setJsonVersion(text, version) {
  const out = text.replace(/^﻿/, '').replace(/("version"\s*:\s*")[^"]+(")/, `$1${version}$2`);
  return out.endsWith('\n') ? out : `${out}\n`;
}

/** Adds "## <version>" to the changelog (with the given bullet lines) unless it already exists. */
export function addChangelogSection(changelog, version, bullets) {
  if (new RegExp(`^## ${version.replace(/\./g, '\\.')}\\b`, 'm').test(changelog)) return changelog;
  const section = `## ${version}\n${(bullets.length ? bullets : ['Maintenance release.']).map((b) => `- ${b}`).join('\n')}\n\n`;
  return changelog.replace(/^(# Changelog\s*\n\n?)/, `$1${section}`);
}

/** Text of one version's section (for GitHub Release notes). */
export function changelogSection(changelog, version) {
  const m = changelog.match(new RegExp(`^## ${version.replace(/\./g, '\\.')}\\b[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  return m ? m[1].trim() : '';
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = new URL('..', import.meta.url);
  const kind = process.argv[2] || 'patch';
  if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') throw new Error('Release from the main branch.');
  if (git('status', '--porcelain')) throw new Error('Commit or stash your changes first (working tree not clean).');

  const manifestUrl = new URL('extension/manifest.json', root);
  const pkgUrl = new URL('package.json', root);
  const current = JSON.parse(readFileSync(manifestUrl, 'utf8').replace(/^﻿/, '')).version;
  const next = bumpVersion(current, kind);

  // Changelog bullets: commit subjects since the last release tag (edit CHANGELOG.md first to write your own).
  let bullets = [];
  try {
    bullets = git('log', `v${current}..HEAD`, '--pretty=%s').split('\n').filter((s) => s && !/^Release v/.test(s));
  } catch {
    /* no previous tag */
  }

  writeFileSync(manifestUrl, setJsonVersion(readFileSync(manifestUrl, 'utf8'), next));
  writeFileSync(pkgUrl, setJsonVersion(readFileSync(pkgUrl, 'utf8'), next));
  const clUrl = new URL('CHANGELOG.md', root);
  writeFileSync(clUrl, addChangelogSection(readFileSync(clUrl, 'utf8'), next, bullets));

  console.log(`Testing ${next}…`);
  execFileSync('npm', ['test'], { stdio: 'inherit', shell: true });
  execFileSync('node', ['scripts/check.mjs'], { stdio: 'inherit' });

  git('add', 'extension/manifest.json', 'package.json', 'CHANGELOG.md');
  git('commit', '-m', `Release v${next}`);
  git('push', 'origin', 'main');
  git('push', 'origin', 'main:dev'); // keep dev level with the release (fast-forward only)
  console.log(`\n⚡ v${next} pushed. GitHub Actions will create the release and publish it to the Chrome Web Store.`);
}
