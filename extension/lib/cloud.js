// Bring-your-own-key cloud engines: Anthropic (Claude) and OpenAI. Raw fetch, no SDKs:
// the extension has no build step and may not load remote code.
// Keys travel only in request headers to the provider's own API host.

export const ANTHROPIC_ORIGINS = ['https://api.anthropic.com/*'];
export const OPENAI_ORIGINS = ['https://api.openai.com/*'];

async function permitted(origins) {
  try {
    return await chrome.permissions.contains({ origins });
  } catch {
    return false;
  }
}
export const anthropicPermitted = () => permitted(ANTHROPIC_ORIGINS);
export const openaiPermitted = () => permitted(OPENAI_ORIGINS);

function httpError(provider, status, message) {
  if (status === 401 || status === 403) return `${provider} rejected the API key. Check it in Settings.`;
  if (status === 404) return `${provider}: model not found. Pick another model in Settings.`;
  if (status === 429) return `${provider} rate limit or quota reached. Try again shortly.`;
  if (status >= 500) return `${provider} is having trouble right now.`;
  return message || `${provider} request failed (${status}).`;
}

async function jsonFetch(provider, url, init) {
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error(`Network error: could not reach ${provider}.`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(httpError(provider, res.status, body?.error?.message));
  return body;
}

// ---------- Anthropic (Claude) ----------

const ANTHROPIC_API = 'https://api.anthropic.com/v1';

function anthropicHeaders(key, beta) {
  const h = {
    'content-type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    // Required for requests that carry a browser/extension Origin.
    'anthropic-dangerous-direct-browser-access': 'true'
  };
  if (beta) h['anthropic-beta'] = beta;
  return h;
}

export async function anthropicModels(key) {
  const body = await jsonFetch('Claude', `${ANTHROPIC_API}/models?limit=100`, { headers: anthropicHeaders(key) });
  return (body.data || []).map((m) => ({ id: m.id, label: m.display_name || m.id }));
}

/** Pure: text + web citations from a Messages API response. Throws on refusal. */
export function parseAnthropicResponse(body) {
  if (body.stop_reason === 'refusal') {
    throw new Error('Claude declined this request. Try rephrasing it.');
  }
  const blocks = body.content || [];
  const text = blocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  const seen = new Set();
  const sources = [];
  const add = (url, title) => {
    if (url && /^https?:\/\//.test(url) && !seen.has(url) && sources.length < 6) {
      seen.add(url);
      sources.push({ url, title: title || url });
    }
  };
  // Prefer what Claude actually cited, then the raw search results.
  for (const b of blocks) for (const c of b.citations || []) add(c.url, c.title);
  for (const b of blocks) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
      for (const r of b.content) if (r.type === 'web_search_result') add(r.url, r.title);
    }
  }
  return { text, sources };
}

export async function anthropicGenerate({ key, model, system, history, userText, searchWeb }) {
  const messages = [
    ...history.map((m) => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text })),
    { role: 'user', content: userText }
  ];
  const request = {
    model,
    max_tokens: 4096,
    system,
    messages,
    // Short coaching answers: low effort keeps them fast and cheap.
    output_config: { effort: 'low' },
    // Route to another model automatically if a safety classifier declines.
    fallbacks: 'default'
  };
  if (searchWeb) request.tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }];

  let body;
  // Server tools may pause a long turn; continue it (bounded) by echoing the content back.
  for (let i = 0; i < 3; i++) {
    body = await jsonFetch('Claude', `${ANTHROPIC_API}/messages`, {
      method: 'POST',
      headers: anthropicHeaders(key, 'server-side-fallback-2026-07-01'),
      body: JSON.stringify(request)
    });
    if (body.stop_reason !== 'pause_turn') break;
    request.messages = [...messages, { role: 'assistant', content: body.content }];
  }
  const result = parseAnthropicResponse(body);
  if (!result.text) throw new Error('Claude returned an empty answer.');
  return result;
}

// ---------- OpenAI ----------

const OPENAI_API = 'https://api.openai.com/v1';
const openaiHeaders = (key) => ({ 'content-type': 'application/json', authorization: `Bearer ${key}` });

export async function openaiModels(key) {
  const body = await jsonFetch('OpenAI', `${OPENAI_API}/models`, { headers: openaiHeaders(key) });
  return (body.data || []).map((m) => ({ id: m.id, created: m.created || 0 }));
}

const NOT_CHAT = /audio|realtime|tts|transcribe|whisper|dall-e|image|embedding|moderation|search|instruct|codex|computer|babbage|davinci/i;

/** Newest general chat model ("gpt-*" without special-purpose suffixes); prefers a "mini" for speed. */
export function pickOpenAIModel(models) {
  const chat = models.filter((m) => /^gpt-/.test(m.id) && !NOT_CHAT.test(m.id) && !/\d{4}-\d{2}-\d{2}/.test(m.id));
  chat.sort((a, b) => b.created - a.created);
  return (chat.find((m) => /mini/.test(m.id)) || chat[0] || {}).id || '';
}

export function parseOpenAIResponse(body) {
  const text = (body.choices?.[0]?.message?.content || '').trim();
  if (!text) throw new Error('OpenAI returned an empty answer.');
  return { text, sources: [] };
}

export async function openaiGenerate({ key, model, system, history, userText }) {
  const body = await jsonFetch('OpenAI', `${OPENAI_API}/chat/completions`, {
    method: 'POST',
    headers: openaiHeaders(key),
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        ...history.map((m) => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text })),
        { role: 'user', content: userText }
      ]
    })
  });
  return parseOpenAIResponse(body);
}
