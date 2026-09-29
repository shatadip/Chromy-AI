import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChrome, installFetch } from './helpers.mjs';

installChrome();
const C = await import('../extension/lib/cloud.js');
const G = await import('../extension/lib/gemini.js');
const P = await import('../extension/lib/prompts.js');

test('Anthropic: text + cited sources (deduped), search results as backup', () => {
  const r = C.parseAnthropicResponse({
    stop_reason: 'end_turn',
    content: [
      { type: 'thinking', thinking: '' },
      { type: 'server_tool_use', name: 'web_search' },
      {
        type: 'web_search_tool_result',
        content: [
          { type: 'web_search_result', url: 'https://b.example', title: 'B' },
          { type: 'web_search_result', url: 'javascript:alert(1)', title: 'bad' }
        ]
      },
      { type: 'text', text: 'Hello ', citations: [{ url: 'https://a.example', title: 'A' }] },
      { type: 'text', text: 'world', citations: [{ url: 'https://a.example', title: 'A again' }] }
    ]
  });
  assert.equal(r.text, 'Hello world');
  assert.deepEqual(r.sources, [
    { url: 'https://a.example', title: 'A' },
    { url: 'https://b.example', title: 'B' }
  ]);
});

test('Anthropic: refusal becomes a friendly error', () => {
  assert.throws(() => C.parseAnthropicResponse({ stop_reason: 'refusal', content: [] }), /declined/);
});

test('Anthropic request: headers, fallbacks, effort, pause_turn continuation', async () => {
  let n = 0;
  const calls = installFetch({
    'https://api.anthropic.com/v1/messages': () =>
      ++n === 1
        ? { json: { stop_reason: 'pause_turn', content: [{ type: 'server_tool_use', id: 's1', name: 'web_search', input: {} }] } }
        : { json: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'done' }] } }
  });
  const r = await C.anthropicGenerate({ key: 'k', model: 'claude-opus-5-5', system: 'sys', history: [{ role: 'model', text: 'prev' }], userText: 'q', searchWeb: true });
  assert.equal(r.text, 'done');
  assert.equal(calls.length, 2);
  const h = calls[0].init.headers;
  assert.equal(h['x-api-key'], 'k');
  assert.equal(h['anthropic-version'], '2023-06-01');
  assert.equal(h['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(h['anthropic-beta'], 'server-side-fallback-2026-07-01');
  const first = JSON.parse(calls[0].init.body);
  assert.equal(first.fallbacks, 'default');
  assert.deepEqual(first.output_config, { effort: 'low' });
  assert.equal(first.messages[0].role, 'assistant');
  const second = JSON.parse(calls[1].init.body);
  assert.equal(second.messages.at(-1).role, 'assistant', 'paused turn is echoed back');
});

test('Anthropic / OpenAI: HTTP errors are human', async () => {
  installFetch({ 'https://api.anthropic.com': () => ({ status: 401, json: { error: { message: 'x' } } }) });
  await assert.rejects(C.anthropicGenerate({ key: 'k', model: 'm', system: 's', history: [], userText: 'u' }), /rejected the API key/);
  installFetch({ 'https://api.openai.com': () => ({ status: 429, json: {} }) });
  await assert.rejects(C.openaiGenerate({ key: 'k', model: 'm', system: 's', history: [], userText: 'u' }), /rate limit/);
});

test('OpenAI: model auto-pick prefers the newest general mini model', () => {
  const models = [
    { id: 'gpt-4o', created: 10 },
    { id: 'gpt-4o-mini', created: 11 },
    { id: 'gpt-9-mini', created: 50 },
    { id: 'gpt-9', created: 49 },
    { id: 'gpt-9-realtime-mini', created: 60 },
    { id: 'gpt-9-mini-2026-01-01', created: 55 },
    { id: 'text-embedding-3-large', created: 70 }
  ];
  assert.equal(C.pickOpenAIModel(models), 'gpt-9-mini');
  assert.equal(C.pickOpenAIModel([]), '');
});

test('OpenAI: parse chat completion', () => {
  assert.deepEqual(C.parseOpenAIResponse({ choices: [{ message: { content: ' hi ' } }] }), { text: 'hi', sources: [] });
  assert.throws(() => C.parseOpenAIResponse({ choices: [] }), /empty/);
});

test('Gemini: parse, sources filtered, auto model pick, retry delay', () => {
  const r = G.parseGeminiResponse({
    candidates: [
      {
        content: { parts: [{ text: 'a' }, { text: 'b' }] },
        groundingMetadata: { groundingChunks: [{ web: { uri: 'https://x.example', title: 'X' } }, { web: { uri: 'https://x.example' } }] }
      }
    ]
  });
  assert.equal(r.text, 'ab');
  assert.equal(r.sources.length, 1);
  assert.throws(() => G.parseGeminiResponse({ promptFeedback: { blockReason: 'SAFETY' } }), /SAFETY/);
  assert.equal(G.pickGeminiModel([{ id: 'gemini-2.5-flash' }, { id: 'gemini-3.8-flash' }, { id: 'gemini-3.8-flash-lite' }]), 'gemini-3.8-flash');
  assert.equal(G.pickGeminiModel(['gemini-flash-latest', 'gemini-3.8-flash']), 'gemini-flash-latest');
  assert.equal(G.retryDelaySeconds({ details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '0.4s' }] }), 1);
  assert.equal(G.retryDelaySeconds({}), null);
});

test('extractScore tolerates small-model formatting', () => {
  assert.deepEqual(P.extractScore('Score: 72/100\nVerdict: ok'), { score: 72, text: 'Verdict: ok' });
  assert.equal(P.extractScore('**Score:** 85 / 100\nx').score, 85);
  assert.equal(P.extractScore('  score - 40\nx').score, 40);
  assert.equal(P.extractScore('Score: 140/100\nx').score, null);
  assert.equal(P.extractScore('Verdict first\nScore: 50').score, null);
  assert.equal(P.tidyAnswer('Fixes:\n- a\nHuman touch: None\nImproved prompt:'), 'Fixes:\n- a\nImproved prompt:');
  assert.equal(P.tidyAnswer('**Human touch:** N/A.\nx'), 'x');
  assert.equal(P.tidyAnswer('Human touch: "teh" → "the", happens to all of us.'), 'Human touch: "teh" → "the", happens to all of us.');
  assert.equal(P.systemPromptFor('ask', 'socrates'), P.SYSTEM_PROMPTS.socrates);
  assert.equal(P.systemPromptFor('task', 'socrates'), P.SYSTEM_PROMPTS.task);
});
