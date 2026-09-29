// Runs a request through the engine chain so that one engine being missing, offline or over
// quota never stops an answer. Local engines come first; cloud engines need the user's own key.
// Context-agnostic: used by the service worker and, for Chrome's built-in model, by the popup.
import { generate as geminiGenerate } from './gemini.js';
import {
  hasBuiltinApi,
  builtinStatus,
  builtinGenerate,
  ollamaPermitted,
  ollamaModelList,
  ollamaGenerate,
  ollamaWarmup,
  resolveOllamaModel,
  estimateRamGB,
  BUILTIN_PAGE_CHARS
} from './local.js';
import { anthropicGenerate, anthropicPermitted, openaiGenerate, openaiPermitted } from './cloud.js';
import { systemPromptFor, extractScore, formatReminder, tidyAnswer } from './prompts.js';
import { getSettings, getMemory, pushMemory, bumpStats } from './store.js';

const MAX_PAGE_CHARS = 12000;
export const ENGINE_ORDER = ['builtin', 'ollama', 'gemini', 'anthropic', 'openai'];
const WEB_ENGINES = ['gemini', 'anthropic']; // engines that can search the web

export const ENGINE_LABELS = {
  builtin: 'Chrome on-device AI',
  ollama: 'Ollama',
  gemini: 'Gemini',
  anthropic: 'Claude',
  openai: 'OpenAI'
};

/**
 * Engine order for a request. The preferred engine goes first; with web search, engines that
 * can search go first (preferred one leading), then the rest as offline fallbacks.
 */
export function engineOrder(preferred, searchWeb) {
  const pref = ENGINE_ORDER.includes(preferred) ? preferred : null;
  let first = pref ? [pref] : [];
  if (searchWeb) first = [...(WEB_ENGINES.includes(pref) ? [pref] : []), ...WEB_ENGINES.filter((e) => e !== pref)];
  return [...first, ...ENGINE_ORDER.filter((e) => !first.includes(e))];
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

// Each engine: ready(req) → null if usable (and may stash details on req), else a short reason;
// generate(req) → { text, sources, via }.
const ENGINES = {
  builtin: {
    async ready() {
      if (!hasBuiltinApi()) return 'not available in this browser';
      const status = await builtinStatus();
      if (status === 'available') return null;
      return status === 'unavailable' ? 'not supported on this device' : 'model not downloaded yet';
    },
    async generate(req) {
      const r = await builtinGenerate({ ...req, userText: withPage(req.prompt, req.page, BUILTIN_PAGE_CHARS) });
      return { ...r, via: ENGINE_LABELS.builtin };
    }
  },
  ollama: {
    async ready(req) {
      if (!(await ollamaPermitted())) return 'not connected yet';
      const models = await ollamaModelList().catch((e) => e);
      if (models instanceof Error) return models.message;
      const model = resolveOllamaModel(models, req.settings, estimateRamGB());
      if (!model) return 'no AI model downloaded yet';
      req.ollamaModel = model;
      return null;
    },
    async generate(req) {
      const r = await ollamaGenerate({
        ...req,
        model: req.ollamaModel,
        userText: withPage(req.prompt, req.page, MAX_PAGE_CHARS)
      });
      return { ...r, via: `${ENGINE_LABELS.ollama} · ${req.ollamaModel}` };
    }
  },
  gemini: {
    async ready(req) {
      return req.settings.apiKey ? null : 'no API key';
    },
    async generate(req) {
      const r = await geminiGenerate({
        apiKey: req.settings.apiKey,
        model: req.settings.model,
        system: req.system,
        history: req.history,
        userText: withPage(req.prompt, req.page, MAX_PAGE_CHARS),
        searchWeb: req.searchWeb,
        temperature: req.temperature
      });
      return { ...r, via: `${ENGINE_LABELS.gemini}${req.searchWeb ? ' + web' : ''}` };
    }
  },
  anthropic: {
    async ready(req) {
      if (!req.settings.anthropicKey) return 'no API key';
      return (await anthropicPermitted()) ? null : 'permission not granted';
    },
    async generate(req) {
      const r = await anthropicGenerate({
        key: req.settings.anthropicKey,
        model: req.settings.anthropicModel,
        system: req.system,
        history: req.history,
        userText: withPage(req.prompt, req.page, MAX_PAGE_CHARS),
        searchWeb: req.searchWeb
      });
      return { ...r, via: `${ENGINE_LABELS.anthropic}${req.searchWeb ? ' + web' : ''}` };
    }
  },
  openai: {
    async ready(req) {
      if (!req.settings.openaiKey) return 'no API key';
      if (!req.settings.openaiModel) return 'no model chosen (open Settings)';
      return (await openaiPermitted()) ? null : 'permission not granted';
    },
    async generate(req) {
      const r = await openaiGenerate({
        key: req.settings.openaiKey,
        model: req.settings.openaiModel,
        system: req.system,
        history: req.history,
        userText: withPage(req.prompt, req.page, MAX_PAGE_CHARS)
      });
      return { ...r, via: ENGINE_LABELS.openai };
    }
  }
};

/** Which engines are usable right now: { builtin: null | reason, ..., ollamaModel?: name } */
export async function engineReport() {
  const req = { settings: await getSettings() };
  const out = {};
  for (const [name, engine] of Object.entries(ENGINES)) out[name] = await engine.ready(req).catch((e) => e.message);
  if (req.ollamaModel) out.ollamaModel = req.ollamaModel;
  return out;
}

/**
 * @param {object} payload
 * @param {string} payload.prompt
 * @param {'ask'|'task'} payload.mode
 * @param {boolean} [payload.usePage]
 * @param {boolean} [payload.searchWeb]
 * @param {number} [payload.tabId]
 * @param {boolean} [payload.questionIt] "Question it" follow-up: shown shorter in the thread
 */
export async function runRequest({ prompt, mode, usePage, searchWeb, tabId, questionIt }) {
  const settings = await getSettings();
  const page = usePage && tabId ? await readActivePage(tabId) : null;
  // Each mode remembers its own conversation: coaching turns would otherwise teach small models
  // to answer tasks in "Score / Verdict" format (and vice versa).
  const history =
    settings.memorySize > 0 ? (await getMemory()).filter((m) => m.mode === mode).slice(-settings.memorySize * 2) : [];
  const style = mode === 'ask' && !questionIt ? settings.askStyle : null;
  const system = systemPromptFor(questionIt ? 'task' : mode, style);

  const pending = { prompt: questionIt ? '🤔 Question it' : prompt, mode, at: Date.now(), partial: '' };
  let lastWrite = 0;
  let finished = false;
  let writing = Promise.resolve();
  const onPartial = (text) => {
    // Throttled so the popup can show the answer as it streams in.
    if (finished || Date.now() - lastWrite < 200) return;
    lastWrite = Date.now();
    writing = chrome.storage.session.set({ pending: { ...pending, partial: text } }).catch(() => {});
  };
  const req = {
    settings,
    prompt: prompt + (style ? formatReminder(mode, style) : ''),
    mode,
    page,
    history,
    searchWeb,
    system,
    temperature: mode === 'ask' ? 0.4 : 0.7,
    onPartial
  };

  // Local models on CPU can take minutes; calling an extension API every 20 s keeps the
  // service worker from being shut down mid-answer (no-op in the popup).
  const heartbeat = setInterval(() => chrome.runtime?.getPlatformInfo?.().catch(() => {}), 20000);
  await chrome.storage.session.set({ pending }).catch(() => {});
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
      if (searchWeb && !WEB_ENGINES.includes(name)) result.via += ' (offline: no web search)';

      const { score, text } = mode === 'ask' && !questionIt ? extractScore(tidyAnswer(result.text)) : { score: null, text: result.text };
      const now = Date.now();
      const shownPrompt = page ? `${pending.prompt}\n\n📄 ${page.selection ? 'Selection from ' : ''}${page.title}` : pending.prompt;
      await pushMemory(
        [
          { role: 'user', text: shownPrompt, mode, at: now },
          { role: 'model', text, mode, sources: result.sources, via: result.via, score, at: now }
        ],
        Math.max(settings.memorySize, 1) // always keep the latest turn so the popup can show it
      );
      const stats = await bumpStats().catch(() => null);
      return { ...result, text, score, stats };
    }
    throw new Error(`No AI engine could answer:\n${failures.join('\n')}\n\nOpen Settings → "Set up free local AI" to fix this in two clicks.`);
  } finally {
    finished = true;
    clearInterval(heartbeat);
    await writing; // a late partial write must not land after the removal below
    await chrome.storage.session.remove('pending').catch(() => {});
  }
}

/** Preloads the local Ollama model when the popup opens, so the first answer starts sooner. */
export async function warmup() {
  const settings = await getSettings();
  if (!['auto', 'ollama'].includes(settings.provider) || !(await ollamaPermitted())) return;
  const model = resolveOllamaModel(await ollamaModelList(), settings, estimateRamGB());
  if (model) await ollamaWarmup(model);
}
