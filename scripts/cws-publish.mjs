// Uploads dist/chromy-ai-v<version>.zip to the Chrome Web Store (API v2) and submits it for publishing.
// Once Google approves the update, every store install updates itself automatically.
//
// Env (GitHub Actions secrets):
//   CWS_PUBLISHER_ID, CWS_EXTENSION_ID                       always
//   CWS_SERVICE_ACCOUNT_JSON                                  service-account auth (recommended), or
//   CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN       OAuth refresh-token auth
// Usage: node scripts/cws-publish.mjs [path/to.zip]
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const API = 'https://chromewebstore.googleapis.com';
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Signed JWT assertion for a Google service account (RS256). */
export function serviceAccountAssertion(sa, now = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: sa.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;
}

export async function accessToken(env = process.env, fetchImpl = fetch) {
  let body;
  if (env.CWS_SERVICE_ACCOUNT_JSON) {
    const sa = JSON.parse(env.CWS_SERVICE_ACCOUNT_JSON);
    body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: serviceAccountAssertion(sa) });
  } else if (env.CWS_CLIENT_ID && env.CWS_CLIENT_SECRET && env.CWS_REFRESH_TOKEN) {
    body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env.CWS_CLIENT_ID,
      client_secret: env.CWS_CLIENT_SECRET,
      refresh_token: env.CWS_REFRESH_TOKEN
    });
  } else {
    throw new Error('No Chrome Web Store credentials: set CWS_SERVICE_ACCOUNT_JSON or CWS_CLIENT_ID/CWS_CLIENT_SECRET/CWS_REFRESH_TOKEN.');
  }
  const res = await fetchImpl('https://oauth2.googleapis.com/token', { method: 'POST', body });
  const json = await res.json();
  if (!res.ok || !json.access_token) throw new Error(`Token request failed (${res.status}): ${json.error_description || json.error || 'unknown'}`);
  return json.access_token;
}

/** Finds an upload state anywhere in a response (fetchStatus nests it). */
export function uploadStateOf(json) {
  if (!json || typeof json !== 'object') return null;
  for (const [k, v] of Object.entries(json)) {
    if (/uploadstate$/i.test(k) && typeof v === 'string') return v;
    if (v && typeof v === 'object') {
      const nested = uploadStateOf(v);
      if (nested) return nested;
    }
  }
  return null;
}

async function call(fetchImpl, url, token, init = {}) {
  const res = await fetchImpl(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${url.replace(API, '')} → ${res.status}: ${json.error?.message || text.slice(0, 300)}`);
  return json;
}

/**
 * Upload + publish. Returns { version, state, warnings }.
 * @param {{zip: string, env?: object, fetchImpl?: typeof fetch, sleep?: (ms:number)=>Promise<void>, log?: (s:string)=>void}} opts
 */
export async function publish({ zip, env = process.env, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = console.log }) {
  const { CWS_PUBLISHER_ID: pub, CWS_EXTENSION_ID: id } = env;
  if (!pub || !id) throw new Error('Set CWS_PUBLISHER_ID and CWS_EXTENSION_ID.');
  const item = `publishers/${pub}/items/${id}`;
  const token = await accessToken(env, fetchImpl);

  log(`Uploading ${zip}…`);
  let up = await call(fetchImpl, `${API}/upload/v2/${item}:upload`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/zip' },
    body: readFileSync(zip)
  });
  let state = uploadStateOf(up);
  for (let i = 0; state === 'UPLOAD_IN_PROGRESS' && i < 30; i++) {
    await sleep(5000);
    up = await call(fetchImpl, `${API}/v2/${item}:fetchStatus`, token);
    state = uploadStateOf(up) || state;
  }
  if (state && state !== 'SUCCEEDED' && state !== 'UPLOAD_SUCCEEDED') {
    throw new Error(`Upload did not succeed (state ${state}): ${JSON.stringify(up).slice(0, 500)}`);
  }
  log(`Uploaded version ${up.crxVersion || '(pending)'} (${state || 'ok'}).`);

  const pubRes = await call(fetchImpl, `${API}/v2/${item}:publish`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH' })
  });
  const warnings = (pubRes.warningInfo?.warnings || []).map((w) => `${w.reason}: ${w.description}`);
  log(`Submitted for review → state ${pubRes.state || 'unknown'}. Users update automatically after approval.`);
  for (const w of warnings) log(`warning: ${w}`);
  return { version: up.crxVersion, state: pubRes.state, warnings };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const manifest = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  const zip = process.argv[2] || fileURLToPath(new URL(`../dist/chromy-ai-v${manifest.version}.zip`, import.meta.url));
  publish({ zip }).catch((e) => {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  });
}
