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

// 127.0.0.1, not localhost: Ollama listens on IPv4 only, and localhost may resolve to ::1 first.
export const OLLAMA_URL = 'http://127.0.0.1:11434';
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

const KEEP_ALIVE = '30m'; // keep the model in RAM between prompts; CPU-only loads are slow

/** Loads the model into memory ahead of the first prompt (no-op if already loaded). */
export async function ollamaWarmup(model) {
  await ollamaFetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, keep_alive: KEEP_ALIVE })
  });
}

/**
 * Streams the answer so the first bytes arrive quickly (an extension service worker is
 * killed if a fetch response takes >30 s) and the UI can show text as it's generated.
 */
export async function ollamaGenerate({ model, mode, history, userText, longContext, onPartial }) {
  let res;
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: true,
        keep_alive: KEEP_ALIVE,
        options: { temperature: mode === 'ask' ? 0.4 : 0.7, num_ctx: longContext ? 8192 : 4096 },
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.task },
          ...history.map((m) => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text })),
          { role: 'user', content: userText }
        ]
      })
    });
  } catch {
    throw new Error('Ollama is not running on this computer.');
  }
  if (res.status === 403) {
    throw new Error('Ollama blocked the request (403). Set OLLAMA_ORIGINS=chrome-extension://* and restart Ollama.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Ollama error ${res.status}`);
  }

  // Response is NDJSON: one {"message":{"content":"..."},"done":bool} object per line.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let raw = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const chunk = JSON.parse(line);
      if (chunk.error) throw new Error(chunk.error);
      raw += chunk.message?.content || '';
    }
    onPartial?.(raw);
  }

  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  if (!text) throw new Error('Ollama returned an empty answer.');
  return { text, sources: [] };
}

export { BUILTIN_PAGE_CHARS };
