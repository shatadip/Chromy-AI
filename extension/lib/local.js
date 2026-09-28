// Local engines: Chrome's built-in model (Gemini Nano via the Prompt API) and Ollama.
import { SYSTEM_PROMPTS } from './gemini.js';

// ---------- Chrome built-in AI ----------

const LANG = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };
const BUILTIN_PAGE_CHARS = 6000; // small context window on-device

export function hasBuiltinApi() {
  return typeof globalThis.LanguageModel !== 'undefined';
}

/** 'unavailable' | 'downloadable' | 'downloading' | 'available' */
export async function builtinStatus() {
  if (!hasBuiltinApi()) return 'unavailable';
  try {
    return await globalThis.LanguageModel.availability(LANG);
  } catch {
    return 'unavailable';
  }
}

/** Starts (or joins) the one-time model download. Must be called from a user click. */
export async function downloadBuiltin(onProgress) {
  const session = await globalThis.LanguageModel.create({
    ...LANG,
    monitor(m) {
      m.addEventListener('downloadprogress', (e) => onProgress?.(e.loaded));
    }
  });
  session.destroy();
}

export async function builtinGenerate({ mode, history, userText }) {
  const session = await globalThis.LanguageModel.create({
    ...LANG,
    initialPrompts: [
      { role: 'system', content: SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.task },
      ...history.map((m) => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text }))
    ]
  });
  try {
    const text = (await session.prompt(userText)).trim();
    if (!text) throw new Error('The on-device model returned an empty answer.');
    return { text, sources: [] };
  } finally {
    session.destroy();
  }
}

// ---------- Ollama ----------

export const OLLAMA_URL = 'http://localhost:11434';
export const OLLAMA_ORIGINS = ['http://localhost:11434/*', 'http://127.0.0.1:11434/*'];

export async function ollamaPermitted() {
  try {
    return await chrome.permissions.contains({ origins: OLLAMA_ORIGINS });
  } catch {
    return false;
  }
}

async function ollamaFetch(path, init = {}, timeoutMs) {
  const ctrl = new AbortController();
  const timer = timeoutMs ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(`${OLLAMA_URL}${path}`, { ...init, signal: ctrl.signal });
    if (res.status === 403) {
      throw new Error('Ollama blocked the request (403). Set OLLAMA_ORIGINS=chrome-extension://* and restart Ollama.');
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Ollama error ${res.status}`);
    return body;
  } catch (e) {
    if (e.name === 'AbortError' || e instanceof TypeError) throw new Error('Ollama is not running on this computer.');
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Installed model names, e.g. ['llama3.2:3b']. Throws if Ollama is not reachable. */
export async function ollamaModels() {
  const body = await ollamaFetch('/api/tags', {}, 2500);
  return (body.models || []).map((m) => m.name);
}

export async function ollamaGenerate({ model, mode, history, userText }) {
  const body = await ollamaFetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      keep_alive: '10m',
      options: { temperature: mode === 'ask' ? 0.4 : 0.7, num_ctx: 8192 },
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.task },
        ...history.map((m) => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text })),
        { role: 'user', content: userText }
      ]
    })
  });
  const text = (body.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  if (!text) throw new Error('Ollama returned an empty answer.');
  return { text, sources: [] };
}

export { BUILTIN_PAGE_CHARS };
