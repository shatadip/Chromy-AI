// Minimal Gemini REST client. The key only ever travels in the x-goog-api-key header.

const API = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Seconds Google asks us to wait, from google.rpc.RetryInfo (e.g. "23s" or "0.5s").
export function retryDelaySeconds(error) {
  const info = (error?.details || []).find((d) => /RetryInfo$/.test(d['@type'] || ''));
  const secs = parseFloat(info?.retryDelay);
  return Number.isFinite(secs) ? Math.ceil(secs) : null;
}

function friendlyError(status, error) {
  const apiMessage = error?.message || '';
  if (status === 400 && /api key/i.test(apiMessage)) return 'Your Gemini API key is invalid. Check it in Settings.';
  if (status === 401 || status === 403) return 'Gemini rejected the API key (not authorised). Check it in Settings.';
  if (status === 404) return 'That model was not found. Pick another model in Settings.';
  if (status === 429) {
    const wait = retryDelaySeconds(error);
    const detail = apiMessage.split('\n')[0].slice(0, 300);
    return [
      `Gemini quota or rate limit hit${wait ? `. Retry in ~${wait}s` : ''}.`,
      detail && `Google says: ${detail}`,
      'Tip: pick a lighter model (e.g. a flash-lite one) in Settings.'
    ]
      .filter(Boolean)
      .join('\n');
  }
  if (status >= 500) return 'Gemini is having trouble right now. Try again shortly.';
  return apiMessage || `Gemini request failed (${status}).`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(path, apiKey, init = {}, retried = false) {
  let res;
  try {
    res = await fetch(`${API}/${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey, ...(init.headers || {}) }
    });
  } catch {
    throw new GeminiError('Network error: could not reach the Gemini API.', 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Short per-minute limits: wait once and retry instead of failing.
    const wait = retryDelaySeconds(body?.error);
    if (res.status === 429 && !retried && wait !== null && wait <= 10) {
      await sleep(wait * 1000 + 250);
      return call(path, apiKey, init, true);
    }
    throw new GeminiError(friendlyError(res.status, body?.error), res.status);
  }
  return body;
}

export async function listModels(apiKey) {
  const body = await call('models?pageSize=200', apiKey);
  return (body.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name }));
}

/** Best default from a model list: stable "flash" (not lite/preview/image/tts), newest version. */
export function pickGeminiModel(models) {
  const ids = models.map((m) => (typeof m === 'string' ? m : m.id));
  if (ids.includes('gemini-flash-latest')) return 'gemini-flash-latest';
  const version = (id) => parseFloat((id.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || '0');
  const flash = ids
    .filter((id) => /^gemini-[\d.]+-flash$/.test(id))
    .sort((a, b) => version(b) - version(a));
  return flash[0] || ids.find((id) => /flash/.test(id) && !/image|tts|audio|live|embed/.test(id)) || ids[0] || '';
}

/**
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {string} opts.system
 * @param {Array<{role:string,text:string}>} opts.history
 * @param {string} opts.userText prompt, with page content already attached
 * @param {boolean} opts.searchWeb
 * @param {number} [opts.temperature]
 */
export async function generate({ apiKey, model, system, history, userText, searchWeb, temperature = 0.6 }) {
  const contents = [
    ...history.map((m) => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.text }] })),
    { role: 'user', parts: [{ text: userText }] }
  ];

  const request = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { temperature, maxOutputTokens: 2048 }
  };
  if (searchWeb) request.tools = [{ google_search: {} }];

  const body = await call(`models/${encodeURIComponent(model)}:generateContent`, apiKey, {
    method: 'POST',
    body: JSON.stringify(request)
  });
  return parseGeminiResponse(body);
}

/** Pure: extracts { text, sources } from a generateContent response. */
export function parseGeminiResponse(body) {
  const candidate = body.candidates?.[0];
  const text = (candidate?.content?.parts || [])
    .map((p) => p.text || '')
    .join('')
    .trim();

  if (!text) {
    const reason = body.promptFeedback?.blockReason || candidate?.finishReason || 'unknown reason';
    throw new GeminiError(`Gemini returned no answer (${reason}). Try rephrasing.`, 200);
  }

  const seen = new Set();
  const sources = (candidate.groundingMetadata?.groundingChunks || [])
    .map((c) => c.web)
    .filter((w) => w && /^https?:\/\//.test(w.uri) && !seen.has(w.uri) && seen.add(w.uri))
    .slice(0, 6)
    .map((w) => ({ title: w.title || w.uri, url: w.uri }));

  return { text, sources };
}
