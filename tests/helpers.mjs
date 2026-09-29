// Minimal chrome.* fake for unit tests (node --test). Each test file runs in its own process.

export function installChrome({ settings = {}, permissions = true } = {}) {
  const local = { settings: { ...settings } };
  const session = {};
  const area = (store) => ({
    get: async (k) => (typeof k === 'string' ? { [k]: store[k] } : { ...store }),
    set: async (o) => void Object.assign(store, structuredClone(o)),
    remove: async (k) => void delete store[k]
  });
  const perms = { value: permissions };
  globalThis.chrome = {
    storage: { local: area(local), session: area(session), onChanged: { addListener() {} } },
    permissions: {
      contains: async ({ origins }) => (typeof perms.value === 'function' ? perms.value(origins) : perms.value)
    },
    runtime: { getPlatformInfo: async () => ({}), id: 'testextensionid' }
  };
  return { local, session, perms };
}

/**
 * Routes fetch() by URL prefix. Handlers get (url, init) and return
 * { status?, json?, ndjson? (array of objects streamed line by line) }.
 */
export function installFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    const key = Object.keys(routes).find((prefix) => url.startsWith(prefix));
    if (!key) throw new TypeError(`fetch failed: ${url}`);
    const r = await routes[key](url, init);
    if (r instanceof Error) throw r;
    const status = r.status ?? 200;
    const bodyText = r.ndjson ? r.ndjson.map((o) => JSON.stringify(o)).join('\n') + '\n' : JSON.stringify(r.json ?? {});
    return new Response(bodyText, { status, headers: { 'content-type': 'application/json' } });
  };
  return calls;
}
