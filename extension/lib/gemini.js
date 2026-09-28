// Minimal Gemini REST client. The key only ever travels in the x-goog-api-key header.

const API = 'https://generativelanguage.googleapis.com/v1beta';

export const SYSTEM_PROMPTS = {
  ask: [
    'You are Chromy AI, a concise prompt-engineering coach.',
    'The user gives you a prompt they plan to send to an AI, or a question about prompting.',
    'If it is a prompt: reply in under 150 words with exactly these parts:',
    '1. "Verdict:" one sentence on how clear and effective it is.',
    '2. "Fixes:" up to 3 short bullet points (role, context, constraints, output format, examples).',
    '3. "Improved prompt:" the rewritten prompt inside a single fenced code block.',
    'If it is a question about prompting: answer in under 120 words with practical tips.',
    'Never pad. Plain text and simple markdown only.'
  ].join('\n'),
  task: [
    'You are Chromy AI, a fast, precise assistant inside the user\'s browser.',
    'Do exactly what the user asks. Be brief and well structured; prefer bullet points.',
    'If page content is provided, base your answer on it and say when the page does not contain the answer.',
    'If you used web search, rely on the retrieved sources for facts that may have changed.'
  ].join('\n')
};

export class GeminiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Seconds Google asks us to wait, from google.rpc.RetryInfo (e.g. "23s" or "0.5s").
function retryDelaySeconds(error) {
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
      'Tips: turn off "Search the web", or pick a lighter model (e.g. a flash-lite one) in Settings → Load models.'
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

/**
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {'ask'|'task'} opts.mode
 * @param {Array<{role:string,text:string}>} opts.history
 * @param {string} opts.prompt
 * @param {{title:string,url:string,text:string}|null} opts.page
 * @param {boolean} opts.searchWeb
 */
export async function generate({ apiKey, model, mode, history, prompt, page, searchWeb }) {
  let userText = prompt;
  if (page) {
    userText =
      `${prompt}\n\n--- Current page ---\nTitle: ${page.title}\nURL: ${page.url}\n\n${page.text}\n--- End of page ---`;
  }

  const contents = [
    ...history.map((m) => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.text }] })),
    { role: 'user', parts: [{ text: userText }] }
  ];

  const request = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.task }] },
    contents,
    generationConfig: { temperature: mode === 'ask' ? 0.4 : 0.7, maxOutputTokens: 2048 }
  };
  if (searchWeb) request.tools = [{ google_search: {} }];

  const body = await call(`models/${encodeURIComponent(model)}:generateContent`, apiKey, {
    method: 'POST',
    body: JSON.stringify(request)
  });

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
