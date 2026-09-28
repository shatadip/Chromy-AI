// Service worker: runs Gemini requests so they finish (and land in memory) even if the popup closes.
import { generate, listModels } from './lib/gemini.js';
import { getSettings, getMemory, pushMemory } from './lib/store.js';

const MAX_PAGE_CHARS = 12000;

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    const { settings } = await chrome.storage.local.get('settings');
    if (!settings?.apiKey) chrome.runtime.openOptionsPage();
  }
});

async function readActivePage(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || !/^https?:|^file:/.test(tab.url)) {
    throw new Error('Chrome does not let extensions read this page. Open a normal web page and try again.');
  }
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (max) => {
        const sel = String(window.getSelection() || '').trim();
        const text = (sel.length > 40 ? sel : document.body?.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
        return { title: document.title, url: location.href, text: text.slice(0, max), selection: sel.length > 40 };
      },
      args: [MAX_PAGE_CHARS]
    });
  } catch {
    throw new Error('Could not read this page (it may be protected, like the Chrome Web Store).');
  }
  const page = results?.[0]?.result;
  if (!page?.text) throw new Error('This page has no readable text.');
  return page;
}

async function run({ prompt, mode, usePage, searchWeb, tabId }) {
  const settings = await getSettings();
  if (!settings.apiKey) throw new Error('Add your Gemini API key in Settings first.');

  const page = usePage && tabId ? await readActivePage(tabId) : null;
  const history = settings.memorySize > 0 ? (await getMemory()).slice(-settings.memorySize * 2) : [];

  await chrome.storage.session.set({ pending: { prompt, mode, at: Date.now() } });
  try {
    const { text, sources } = await generate({
      apiKey: settings.apiKey,
      model: settings.model,
      mode,
      history,
      prompt,
      page,
      searchWeb
    });
    const now = Date.now();
    const shownPrompt = page ? `${prompt}\n\n📄 ${page.selection ? 'Selection from ' : ''}${page.title}` : prompt;
    await pushMemory(
      [
        { role: 'user', text: shownPrompt, mode, at: now },
        { role: 'model', text, mode, sources, at: now }
      ],
      Math.max(settings.memorySize, 1) // always keep the latest turn so the popup can show it
    );
    return { text, sources };
  } finally {
    await chrome.storage.session.remove('pending');
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handlers = {
    run: () => run(msg.payload),
    listModels: () => listModels(msg.apiKey)
  };
  const handler = handlers[msg?.type];
  if (!handler) return false;
  handler()
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
  return true; // async response
});
