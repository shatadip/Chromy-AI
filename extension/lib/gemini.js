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

function friendlyError(status, apiMessage) {
  if (status === 400 && /api key/i.test(apiMessage)) return 'Your Gemini API key is invalid. Check it in Settings.';
  if (status === 401 || status === 403) return 'Gemini rejected the API key (not authorised). Check it in Settings.';
  if (status === 404) return 'That model was not found. Pick another model in Settings.';
  if (status === 429) return 'Rate limit or quota reached on your Gemini key. Wait a moment and try again.';
  if (status >= 500) return 'Gemini is having trouble right now. Try again shortly.';
  return apiMessage || `Gemini request failed (${status}).`;
}

async function call(path, apiKey, init = {}) {
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
  if (!res.ok) throw new GeminiError(friendlyError(res.status, body?.error?.message), res.status);
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
