import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bumpVersion, setJsonVersion, addChangelogSection, changelogSection } from '../scripts/release.mjs';
import { serviceAccountAssertion, uploadStateOf, publish, accessToken } from '../scripts/cws-publish.mjs';

test('bumpVersion', () => {
  assert.equal(bumpVersion('1.2.1'), '1.2.2');
  assert.equal(bumpVersion('1.2.1', 'minor'), '1.3.0');
  assert.equal(bumpVersion('1.2.1', 'major'), '2.0.0');
  assert.throws(() => bumpVersion('1.2', 'patch'));
  assert.throws(() => bumpVersion('1.2.1', 'huge'));
});

test('setJsonVersion keeps formatting, strips BOM, adds final newline', () => {
  const src = '﻿{\n  "manifest_version": 3,\n  "version": "1.2.1",\n  "x": {"version": "9"}\n}';
  const out = setJsonVersion(src, '1.2.2');
  assert.equal(out, '{\n  "manifest_version": 3,\n  "version": "1.2.2",\n  "x": {"version": "9"}\n}\n');
});

test('changelog: add section once, read it back', () => {
  const cl = '# Changelog\n\n## 1.2.1\n- a\n\n## 1.2.0\n- b\n';
  const added = addChangelogSection(cl, '1.2.2', ['Fix x', 'Add y']);
  assert.match(added, /^# Changelog\n\n## 1\.2\.2\n- Fix x\n- Add y\n\n## 1\.2\.1/);
  assert.equal(addChangelogSection(added, '1.2.2', ['again']), added);
  assert.equal(changelogSection(added, '1.2.1'), '- a');
  assert.equal(changelogSection(added, '1.2.0'), '- b');
  assert.equal(changelogSection(added, '9.9.9'), '');
  assert.equal(changelogSection('# Changelog\n\n## 1.2.1 — "Name"\n- z\n', '1.2.1'), '- z');
});

test('service-account JWT is a valid RS256 signature over the claims', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const sa = { client_email: 'bot@p.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  const jwt = serviceAccountAssertion(sa, 1000);
  const [h, c, s] = jwt.split('.');
  const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
  assert.deepEqual(claims, {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/chromewebstore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: 1000,
    exp: 4600
  });
  const v = createVerify('RSA-SHA256');
  v.update(`${h}.${c}`);
  assert.ok(v.verify(publicKey, Buffer.from(s, 'base64url')));
});

test('uploadStateOf finds nested states', () => {
  assert.equal(uploadStateOf({ uploadState: 'SUCCEEDED' }), 'SUCCEEDED');
  assert.equal(uploadStateOf({ lastAsyncUploadState: 'UPLOAD_IN_PROGRESS' }), 'UPLOAD_IN_PROGRESS');
  assert.equal(uploadStateOf({ a: { b: { uploadState: 'FAILED' } } }), 'FAILED');
  assert.equal(uploadStateOf({}), null);
});

test('publish: token → upload → poll → publish (v2 endpoints)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cws-'));
  const zip = join(dir, 'x.zip');
  writeFileSync(zip, 'PK');
  const calls = [];
  let polls = 0;
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', auth: init.headers?.Authorization, body: init.body });
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status });
    if (url.startsWith('https://oauth2.googleapis.com/token')) return json({ access_token: 'T' });
    if (url.endsWith(':upload')) return json({ uploadState: 'UPLOAD_IN_PROGRESS' });
    if (url.endsWith(':fetchStatus')) return json(++polls < 2 ? { lastAsyncUploadState: 'UPLOAD_IN_PROGRESS' } : { lastAsyncUploadState: 'SUCCEEDED', crxVersion: '1.2.2' });
    if (url.endsWith(':publish')) return json({ state: 'PENDING_REVIEW', warningInfo: { warnings: [{ reason: 'R', description: 'D' }] } });
    return json({}, 404);
  };
  const env = { CWS_PUBLISHER_ID: 'pub', CWS_EXTENSION_ID: 'ext', CWS_CLIENT_ID: 'c', CWS_CLIENT_SECRET: 's', CWS_REFRESH_TOKEN: 'r' };
  const out = await publish({ zip, env, fetchImpl, sleep: async () => {}, log: () => {} });
  assert.deepEqual(out, { version: '1.2.2', state: 'PENDING_REVIEW', warnings: ['R: D'] });
  assert.equal(calls[1].url, 'https://chromewebstore.googleapis.com/upload/v2/publishers/pub/items/ext:upload');
  assert.equal(calls[1].auth, 'Bearer T');
  assert.equal(calls.at(-1).url, 'https://chromewebstore.googleapis.com/v2/publishers/pub/items/ext:publish');
  assert.deepEqual(JSON.parse(calls.at(-1).body), { publishType: 'DEFAULT_PUBLISH' });
});

test('publish: failed upload and missing credentials are clear errors', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cws-'));
  const zip = join(dir, 'x.zip');
  writeFileSync(zip, 'PK');
  const fetchImpl = async (url) =>
    new Response(JSON.stringify(url.includes('token') ? { access_token: 'T' } : { uploadState: 'FAILED', itemError: [{ error_detail: 'version too low' }] }));
  const env = { CWS_PUBLISHER_ID: 'p', CWS_EXTENSION_ID: 'e', CWS_REFRESH_TOKEN: 'r', CWS_CLIENT_ID: 'c', CWS_CLIENT_SECRET: 's' };
  await assert.rejects(publish({ zip, env, fetchImpl, log: () => {} }), /FAILED.*version too low/);
  await assert.rejects(accessToken({}, fetchImpl), /No Chrome Web Store credentials/);
});
