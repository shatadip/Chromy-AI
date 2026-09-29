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

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await syncOllamaRule();
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
});
chrome.runtime.onStartup.addListener(syncOllamaRule);
chrome.permissions.onAdded.addListener(syncOllamaRule);
chrome.permissions.onRemoved.addListener(syncOllamaRule);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handlers = {
    run: () => runRequest(msg.payload),
    engines: () => engineReport(),
    warmup: () => warmup(),
    syncOllamaRule: () => syncOllamaRule()
  };
  const handler = handlers[msg?.type];
  if (!handler) return false;
  handler()
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
  return true; // async response
});
