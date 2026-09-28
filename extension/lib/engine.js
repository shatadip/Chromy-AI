// Runs a request through the engine chain (built-in → Ollama → Gemini, or the user's preferred
// engine first) so that one engine being missing, offline or over quota never stops an answer.
// Context-agnostic: used by the service worker and, for Chrome's built-in model, by the popup.
import { generate as geminiGenerate } from './gemini.js';
import {
  hasBuiltinApi,
  builtinStatus,
  builtinGenerate,
  ollamaPermitted,
  ollamaModels,
  ollamaGenerate,
  BUILTIN_PAGE_CHARS
} from './local.js';
import { getSettings, getMemory, pushMemory } from './store.js';

const MAX_PAGE_CHARS = 12000;
const DEFAULT_ORDER = ['builtin', 'ollama', 'gemini'];

export const ENGINE_LABELS = { builtin: 'Chrome on-device AI', ollama: 'Ollama', gemini: 'Gemini' };

/** Engine order for a request. Web search prefers Gemini (the only engine with internet access). */
export function engineOrder(preferred, searchWeb) {
  const first = searchWeb ? 'gemini' : preferred && preferred !== 'auto' ? preferred : null;
  return first ? [first, ...DEFAULT_ORDER.filter((e) => e !== first)] : [...DEFAULT_ORDER];
}

export async function readActivePage(tabId) {
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

function withPage(prompt, page, maxChars) {
  if (!page) return prompt;
  return `${prompt}\n\n--- Current page ---\nTitle: ${page.title}\nURL: ${page.url}\n\n${page.text.slice(0, maxChars)}\n--- End of page ---`;
}

// Each engine: ready() → null if usable, else a short reason; generate() → { text, sources, via }.
const ENGINES = {
  builtin: {
    async ready() {
      if (!hasBuiltinApi()) return 'not supported by this browser or device';
      const status = await builtinStatus();
      if (status === 'available') return null;
      return status === 'unavailable' ? 'not supported on this device' : 'model not downloaded yet (Settings)';
    },
    async generate(req) {
      const r = await builtinGenerate({ ...req, userText: withPage(req.prompt, req.page, BUILTIN_PAGE_CHARS) });
      return { ...r, via: ENGINE_LABELS.builtin };
    }
  },
  ollama: {
    async ready(req) {
      if (!(await ollamaPermitted())) return 'not connected (Settings → Connect Ollama)';
      const models = await ollamaModels().catch((e) => e);
      if (models instanceof Error) return models.message;
      if (!models.length) return 'no models installed (run: ollama pull llama3.2:3b)';
      req.ollamaModel = models.includes(req.settings.ollamaModel) ? req.settings.ollamaModel : models[0];
      return null;
    },
    async generate(req) {
      const r = await ollamaGenerate({ ...req, model: req.ollamaModel, userText: withPage(req.prompt, req.page, MAX_PAGE_CHARS) });
      return { ...r, via: `${ENGINE_LABELS.ollama} · ${req.ollamaModel}` };
    }
  },
  gemini: {
    async ready(req) {
      return req.settings.apiKey ? null : 'no API key (Settings)';
    },
    async generate(req) {
      const r = await geminiGenerate({
        apiKey: req.settings.apiKey,
        model: req.settings.model,
        mode: req.mode,
        history: req.history,
        userText: withPage(req.prompt, req.page, MAX_PAGE_CHARS),
        searchWeb: req.searchWeb
      });
      return { ...r, via: `${ENGINE_LABELS.gemini}${req.searchWeb ? ' + web' : ''}` };
    }
  }
};

/** Which engines are usable right now: { builtin: null | reason, ollama: ..., gemini: ... } */
export async function engineReport() {
  const req = { settings: await getSettings() };
  const out = {};
  for (const [name, engine] of Object.entries(ENGINES)) out[name] = await engine.ready(req).catch((e) => e.message);
  return out;
}

export async function runRequest({ prompt, mode, usePage, searchWeb, tabId }) {
  const settings = await getSettings();
  const page = usePage && tabId ? await readActivePage(tabId) : null;
  const history = settings.memorySize > 0 ? (await getMemory()).slice(-settings.memorySize * 2) : [];
  const req = { settings, prompt, mode, page, history, searchWeb };

  await chrome.storage.session.set({ pending: { prompt, mode, at: Date.now() } }).catch(() => {});
  try {
    const failures = [];
    for (const name of engineOrder(settings.provider, searchWeb)) {
      const engine = ENGINES[name];
      const notReady = await engine.ready(req).catch((e) => e.message);
      if (notReady) {
        failures.push(`• ${ENGINE_LABELS[name]}: ${notReady}`);
        continue;
      }
      let result;
      try {
        result = await engine.generate(req);
      } catch (e) {
        failures.push(`• ${ENGINE_LABELS[name]}: ${e.message.split('\n')[0]}`);
        continue;
      }
      if (searchWeb && name !== 'gemini') result.via += ' (offline: web search unavailable)';

      const now = Date.now();
      const shownPrompt = page ? `${prompt}\n\n📄 ${page.selection ? 'Selection from ' : ''}${page.title}` : prompt;
      await pushMemory(
        [
          { role: 'user', text: shownPrompt, mode, at: now },
          { role: 'model', text: result.text, mode, sources: result.sources, via: result.via, at: now }
        ],
        Math.max(settings.memorySize, 1) // always keep the latest turn so the popup can show it
      );
      return result;
    }
    throw new Error(`No AI engine could answer:\n${failures.join('\n')}\n\nOpen Settings to set one up.`);
  } finally {
    await chrome.storage.session.remove('pending').catch(() => {});
  }
}
