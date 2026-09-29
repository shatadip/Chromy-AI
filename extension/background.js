// Service worker: runs requests so they finish (and land in memory) even if the popup closes.
import { runRequest, engineReport, warmup } from './lib/engine.js';
import { ollamaPermitted } from './lib/local.js';

// Ollama rejects requests carrying a chrome-extension:// Origin unless OLLAMA_ORIGINS is set.
// Strip the Origin header on our own requests to the local Ollama port (only once the user
// has granted the optional localhost permission).
const OLLAMA_RULE_ID = 1;
async function syncOllamaRule() {
  const granted = await ollamaPermitted();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [OLLAMA_RULE_ID],
    addRules: granted
      ? [
          {
            id: OLLAMA_RULE_ID,
            priority: 1,
            action: { type: 'modifyHeaders', requestHeaders: [{ header: 'origin', operation: 'remove' }] },
            condition: {
              regexFilter: '^http://(localhost|127\\.0\\.0\\.1):11434/',
              initiatorDomains: [chrome.runtime.id],
              resourceTypes: ['xmlhttprequest', 'other']
            }
          }
        ]
      : []
  });
}

chrome.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
  await syncOllamaRule();
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  const version = chrome.runtime.getManifest().version;
  if (reason === 'update' && previousVersion && previousVersion !== version) {
    // The popup shows "Updated to vX" once.
    await chrome.storage.local.set({ justUpdated: { from: previousVersion, to: version, at: Date.now() } });
  }
});

// ---------- updates ----------
// Store installs update themselves: Chrome checks every few hours, downloads the new version, and by
// default applies it only when the browser restarts. Apply it as soon as no answer is in progress.
async function applyUpdateWhenIdle() {
  const { pending } = await chrome.storage.session.get('pending');
  if (!pending) return chrome.runtime.reload();
  const onChange = (changes, area) => {
    if (area === 'session' && changes.pending && !changes.pending.newValue) {
      chrome.storage.onChanged.removeListener(onChange);
      chrome.runtime.reload();
    }
  };
  chrome.storage.onChanged.addListener(onChange);
}
chrome.runtime.onUpdateAvailable.addListener(applyUpdateWhenIdle);

const UPDATE_CHECK_EVERY = 6 * 3600 * 1000;
/** Asks Chrome to look for a newer store version now (Chrome throttles this itself too). */
async function checkForUpdate(force = false) {
  const { lastUpdateCheck = 0 } = await chrome.storage.local.get('lastUpdateCheck');
  if (!force && Date.now() - lastUpdateCheck < UPDATE_CHECK_EVERY) return { status: 'skipped' };
  await chrome.storage.local.set({ lastUpdateCheck: Date.now() });
  try {
    const res = await chrome.runtime.requestUpdateCheck();
    // Chrome ≥ 109 resolves { status, version }; older builds used a callback with (status, details).
    return typeof res === 'string' ? { status: res } : res || { status: 'no_update' };
  } catch (e) {
    return { status: 'error', error: e.message };
  }
}
chrome.runtime.onStartup.addListener(() => checkForUpdate());
chrome.runtime.onStartup.addListener(syncOllamaRule);
chrome.permissions.onAdded.addListener(syncOllamaRule);
chrome.permissions.onRemoved.addListener(syncOllamaRule);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handlers = {
    run: () => runRequest(msg.payload),
    engines: () => engineReport(),
    warmup: () => warmup(),
    checkForUpdate: () => checkForUpdate(!!msg.force),
    syncOllamaRule: () => syncOllamaRule()
  };
  const handler = handlers[msg?.type];
  if (!handler) return false;
  handler()
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
  return true; // async response
});
