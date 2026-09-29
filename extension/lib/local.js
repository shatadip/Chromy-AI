// Local engines: Chrome's built-in model (Gemini Nano via the Prompt API) and Ollama.

// ---------- Chrome built-in AI ----------

const LANG = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };
export const BUILTIN_PAGE_CHARS = 6000; // small context window on-device

export function hasBuiltinApi() {
  return typeof globalThis.LanguageModel !== 'undefined';
}

/**
 * 'unavailable' | 'downloadable' | 'downloading' | 'available'.
 * On some fresh profiles Chrome's model service isn't running and availability() never settles,
 * so a slow answer counts as unavailable instead of stalling the whole engine chain.
 */
export async function builtinStatus(timeoutMs = 1500) {
  if (!hasBuiltinApi()) return 'unavailable';
  let timer;
  try {
    return await Promise.race([
      globalThis.LanguageModel.availability(LANG),
      new Promise((resolve) => (timer = setTimeout(() => resolve('unavailable'), timeoutMs)))
    ]);
  } catch {
    return 'unavailable';
  } finally {
    clearTimeout(timer);
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

export async function builtinGenerate({ system, history, userText, onPartial }) {
  const session = await globalThis.LanguageModel.create({
    ...LANG,
    initialPrompts: [
      { role: 'system', content: system },
      ...history.map((m) => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text }))
    ]
  });
  try {
    let text = '';
    if (session.promptStreaming && onPartial) {
      for await (const chunk of session.promptStreaming(userText)) {
        // Chrome ≥ 131 streams deltas; older builds streamed the full text so far.
        text = chunk.startsWith(text) ? chunk : text + chunk;
        onPartial(text);
      }
    } else {
      text = await session.prompt(userText);
    }
    text = text.trim();
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
const KEEP_ALIVE = '30m'; // keep the model in RAM between prompts; CPU-only loads are slow
// One context size for every request (warm-up, chat, page tasks): Ollama reloads the model whenever
// num_ctx changes, which is slow and can crash the runner on low-memory machines.
export const NUM_CTX = 8192;
const RUNNER_CRASH = /error was encountered while running the model|forcibly closed|connection reset|unexpected EOF|llama runner/i;

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

/** Is the Ollama server up? Resolves to its version string, or null. */
export async function ollamaVersion() {
  try {
    return (await ollamaFetch('/api/version', {}, 1500)).version || 'unknown';
  } catch {
    return null;
  }
}

/** Installed models: [{ name, size (bytes), params ('3.1B'), family }]. Throws if unreachable. */
export async function ollamaModelList() {
  const body = await ollamaFetch('/api/tags', {}, 2500);
  return (body.models || []).map((m) => ({
    name: m.name,
    size: m.size || 0,
    params: m.details?.parameter_size || '',
    family: m.details?.family || ''
  }));
}

/** Installed model names, e.g. ['qwen2.5:3b']. Throws if Ollama is not reachable. */
export async function ollamaModels() {
  return (await ollamaModelList()).map((m) => m.name);
}

// ---------- model choice ----------

/** Models we suggest in onboarding, smallest first. */
export const STARTER_MODELS = [
  { name: 'qwen2.5:1.5b', label: 'Tiny & quick', size: '1 GB', minRamGB: 0 },
  { name: 'qwen2.5:3b', label: 'Balanced (recommended)', size: '1.9 GB', minRamGB: 6 },
  { name: 'qwen2.5:7b', label: 'Smartest (needs 16 GB RAM)', size: '4.7 GB', minRamGB: 12 }
];

/**
 * Device RAM in GB. navigator.deviceMemory is capped at 8 and rounded, so "8" means "8 or more";
 * many cores + 8 GB usually means a bigger machine.
 */
export function estimateRamGB(nav = globalThis.navigator || {}) {
  const mem = Number(nav.deviceMemory) || 4;
  const cores = Number(nav.hardwareConcurrency) || 4;
  return mem >= 8 && cores >= 12 ? 16 : mem;
}

/** Starter model to download for this device. */
export function recommendModel(ramGB) {
  return [...STARTER_MODELS].reverse().find((m) => ramGB >= m.minRamGB).name;
}

const NOT_CHAT = /embed|bge|nomic|minilm|all-mini|rerank|clip|whisper|tts/i;
const FAMILY_RANK = [/qwen3/i, /qwen2\.5/i, /llama3\.[1-9]/i, /gemma[34]/i, /phi[34]/i, /mistral/i, /llama/i, /qwen/i, /gemma/i];

/** Billions of parameters from "3.1B"/"494.03M" or a tag like "llama3.2:3b". */
export function paramBillions(model) {
  const src = `${model.params || ''} ${model.name || ''}`;
  const b = src.match(/(\d+(?:\.\d+)?)\s*b\b/i);
  if (b) return parseFloat(b[1]);
  const m = src.match(/(\d+(?:\.\d+)?)\s*m\b/i);
  if (m) return parseFloat(m[1]) / 1000;
  return model.size ? model.size / 0.6e9 : 3; // ~0.6 GB per billion at Q4
}

/**
 * Best installed chat model for this machine: the biggest one that comfortably fits in RAM,
 * ties broken by model family quality. Returns '' when nothing usable is installed.
 */
export function pickBestModel(models, ramGB) {
  const usable = models
    .map((m) => (typeof m === 'string' ? { name: m } : m))
    .filter((m) => m.name && !NOT_CHAT.test(m.name));
  if (!usable.length) return '';
  const budget = ramGB <= 4 ? 2 : ramGB <= 8 ? 4 : ramGB <= 16 ? 9 : 15; // billions of params
  const rank = (m) => {
    const i = FAMILY_RANK.findIndex((re) => re.test(m.name));
    return i === -1 ? FAMILY_RANK.length : i;
  };
  const score = (m) => {
    const p = paramBillions(m);
    const fits = p <= budget;
    // Fitting models: bigger is better. Oversized: smaller is better (and always behind fitting ones).
    return (fits ? 1000 + p * 10 : 500 - p) - rank(m) * 3;
  };
  return usable.sort((a, b) => score(b) - score(a))[0].name;
}

/** The model to use: the user's manual pick if still installed, else the auto choice. */
export function resolveOllamaModel(models, settings, ramGB) {
  const names = models.map((m) => (typeof m === 'string' ? m : m.name));
  if (settings.ollamaModelManual && names.includes(settings.ollamaModel)) return settings.ollamaModel;
  return pickBestModel(models, ramGB);
}

// ---------- download / warm up / generate ----------

/**
 * Downloads a model through Ollama (no terminal needed), reporting progress 0..1.
 * @param {(p:{status:string, fraction:number|null}) => void} onProgress
 */
export async function ollamaPull(model, onProgress, signal) {
  let res;
  try {
    res = await fetch(`${OLLAMA_URL}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: true }),
      signal
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('Ollama is not running on this computer.');
  }
  if (!res.ok) throw new Error(`Ollama could not download ${model} (${res.status}).`);
  await readNdjson(res, (chunk) => {
    if (chunk.error) throw new Error(chunk.error);
    const fraction = chunk.total ? (chunk.completed || 0) / chunk.total : null;
    onProgress?.({ status: chunk.status || '', fraction });
  });
}

/** Loads the model into memory ahead of the first prompt (no-op if already loaded). */
export async function ollamaWarmup(model) {
  await ollamaFetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, keep_alive: KEEP_ALIVE, options: { num_ctx: NUM_CTX } })
  });
}

async function readNdjson(res, onObject) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) if (line.trim()) onObject(JSON.parse(line));
  }
  if (buffer.trim()) onObject(JSON.parse(buffer));
}

/**
 * Streams the answer so the first bytes arrive quickly (an extension service worker is
 * killed if a fetch response takes >30 s) and the UI can show text as it's generated.
 */
export async function ollamaGenerate(opts) {
  try {
    return await ollamaChat(opts);
  } catch (e) {
    // The model runner occasionally dies (low memory, old GPU drivers); Ollama restarts it, so retry once.
    if (!RUNNER_CRASH.test(e.message)) throw e;
    opts.onPartial?.('');
    return ollamaChat(opts);
  }
}

async function ollamaChat({ model, system, history, userText, temperature = 0.6, onPartial }) {
  let res;
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: true,
        keep_alive: KEEP_ALIVE,
        options: { temperature, num_ctx: NUM_CTX },
        messages: [
          { role: 'system', content: system },
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
  let raw = '';
  await readNdjson(res, (chunk) => {
    if (chunk.error) throw new Error(chunk.error);
    raw += chunk.message?.content || '';
    onPartial?.(stripThinking(raw));
  });

  const text = stripThinking(raw).trim();
  if (!text) throw new Error('Ollama returned an empty answer.');
  return { text, sources: [] };
}

/** Removes <think>…</think> reasoning (and an unfinished trailing one) from reasoning models. */
export function stripThinking(s) {
  return s.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*$/, '');
}
