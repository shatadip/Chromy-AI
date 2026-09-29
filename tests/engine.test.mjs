import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChrome, installFetch } from './helpers.mjs';

const env = installChrome({ settings: { memorySize: 10 } });
const { runRequest, engineOrder, engineReport } = await import('../extension/lib/engine.js');

const OLLAMA = 'http://127.0.0.1:11434';
const GEMINI = 'https://generativelanguage.googleapis.com';
const CLAUDE = 'https://api.anthropic.com';

const ollamaUp = (answer = 'Score: 72/100\nVerdict: fine.') => ({
  [`${OLLAMA}/api/tags`]: () => ({ json: { models: [{ name: 'nomic-embed-text' }, { name: 'qwen2.5:3b', details: { parameter_size: '3.1B' } }] } }),
  [`${OLLAMA}/api/chat`]: () => ({ ndjson: [{ message: { content: answer.slice(0, 5) } }, { message: { content: answer.slice(5) }, done: true }] })
});
const ollamaDown = { [`${OLLAMA}`]: () => new TypeError('Failed to fetch') };
const gemini429 = {
  [GEMINI]: () => ({ status: 429, json: { error: { message: 'quota', details: [{ '@type': 'x.RetryInfo', retryDelay: '40s' }] } } })
};
const geminiOk = { [GEMINI]: () => ({ json: { candidates: [{ content: { parts: [{ text: 'from gemini' }] } }] } }) };

function setSettings(patch) {
  env.local.settings = { memorySize: 10, provider: 'auto', ...patch };
  env.local.memory = [];
}

test('engineOrder: local first, preferred first, web engines first for search', () => {
  assert.deepEqual(engineOrder('auto', false), ['builtin', 'ollama', 'gemini', 'anthropic', 'openai']);
  assert.deepEqual(engineOrder('openai', false), ['openai', 'builtin', 'ollama', 'gemini', 'anthropic']);
  assert.deepEqual(engineOrder('auto', true), ['gemini', 'anthropic', 'builtin', 'ollama', 'openai']);
  assert.deepEqual(engineOrder('anthropic', true), ['anthropic', 'gemini', 'builtin', 'ollama', 'openai']);
  assert.deepEqual(engineOrder('ollama', true), ['gemini', 'anthropic', 'builtin', 'ollama', 'openai']);
  assert.deepEqual(engineOrder('nonsense', false), ['builtin', 'ollama', 'gemini', 'anthropic', 'openai']);
});

test('Ask via Ollama: auto-picks a chat model (not the embedder), streams, extracts score, stores memory', async () => {
  setSettings({});
  const calls = installFetch(ollamaUp('Score: 72/100\nVerdict: fine.'));
  const r = await runRequest({ prompt: 'write a poem', mode: 'ask' });
  assert.equal(r.via, 'Ollama · qwen2.5:3b');
  assert.equal(r.score, 72);
  assert.equal(r.text, 'Verdict: fine.');
  const chat = JSON.parse(calls.find((c) => c.url.endsWith('/api/chat')).init.body);
  assert.equal(chat.model, 'qwen2.5:3b');
  assert.match(chat.messages[0].content, /prompt-engineering coach/);
  assert.equal(env.local.memory.length, 2);
  assert.equal(env.local.memory[1].score, 72);
  assert.equal(env.local.stats.sparks, 1);
  assert.equal(env.session.pending, undefined, 'pending cleared');
});

test('Socrates style changes the system prompt', async () => {
  setSettings({ askStyle: 'socrates' });
  const calls = installFetch(ollamaUp('Score: 40/100\nQuestions: 1. Why?'));
  await runRequest({ prompt: 'x', mode: 'ask' });
  const chat = JSON.parse(calls.find((c) => c.url.endsWith('/api/chat')).init.body);
  assert.match(chat.messages[0].content, /Socratic mode/);
  // Format reminder rides on the live message only; memory keeps the user's words.
  assert.match(chat.messages.at(-1).content, /^x\n\n\(Socratic format:/);
  assert.equal(env.local.memory[0].text, 'x');
});

test('Question it: no score extraction, shown as a short label', async () => {
  setSettings({});
  installFetch(ollamaUp('Score: 10/100 should stay as text'));
  const r = await runRequest({ prompt: 'long instruction', mode: 'ask', questionIt: true });
  assert.equal(r.score, null);
  assert.match(r.text, /^Score: 10/);
  assert.equal(env.local.memory[0].text, '🤔 Question it');
});

test('history is per mode: Ask turns are not sent with a Task', async () => {
  setSettings({});
  env.local.memory = [
    { role: 'user', text: 'coach me', mode: 'ask' },
    { role: 'model', text: 'Verdict: meh', mode: 'ask' },
    { role: 'user', text: 'earlier task', mode: 'task' },
    { role: 'model', text: 'task answer', mode: 'task' }
  ];
  const calls = installFetch(ollamaUp('fine'));
  await runRequest({ prompt: 'summarise', mode: 'task' });
  const msgs = JSON.parse(calls.find((c) => c.url.endsWith('/api/chat')).init.body).messages.map((m) => m.content);
  assert.deepEqual(msgs.slice(1), ['earlier task', 'task answer', 'summarise']);
});

test('manual Ollama model wins while installed', async () => {
  setSettings({ ollamaModel: 'nomic-embed-text', ollamaModelManual: true });
  const calls = installFetch(ollamaUp());
  await runRequest({ prompt: 'x', mode: 'task' });
  assert.equal(JSON.parse(calls.find((c) => c.url.endsWith('/api/chat')).init.body).model, 'nomic-embed-text');
});

test('web search: Gemini 429 falls back to Claude web search, then would go local', async () => {
  setSettings({ apiKey: 'g', anthropicKey: 'a' });
  const calls = installFetch({
    ...gemini429,
    [CLAUDE]: () => ({
      json: {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'claude answer', citations: [{ url: 'https://a.example', title: 'A' }] }]
      }
    })
  });
  const r = await runRequest({ prompt: 'news?', mode: 'task', searchWeb: true });
  assert.equal(r.via, 'Claude + web');
  assert.deepEqual(r.sources, [{ url: 'https://a.example', title: 'A' }]);
  const body = JSON.parse(calls.find((c) => c.url.startsWith(CLAUDE)).init.body);
  assert.equal(body.tools[0].type, 'web_search_20260209');
  assert.equal(body.model, 'claude-opus-5-5');
});

test('web search with only local AI: answers offline and says so', async () => {
  setSettings({});
  installFetch(ollamaUp('plain answer'));
  const r = await runRequest({ prompt: 'news?', mode: 'task', searchWeb: true });
  assert.equal(r.via, 'Ollama · qwen2.5:3b (offline: no web search)');
});

test('Ollama down → Gemini answers', async () => {
  setSettings({ apiKey: 'g' });
  installFetch({ ...ollamaDown, ...geminiOk });
  const r = await runRequest({ prompt: 'x', mode: 'task' });
  assert.equal(r.via, 'Gemini');
});

test('nothing works → one clear error listing every engine', async () => {
  setSettings({ apiKey: 'g' });
  installFetch({ ...ollamaDown, ...gemini429 });
  await assert.rejects(runRequest({ prompt: 'x', mode: 'task' }), (e) => {
    assert.match(e.message, /No AI engine could answer/);
    assert.match(e.message, /Chrome on-device AI: not available/);
    assert.match(e.message, /Ollama: Ollama is not running/);
    assert.match(e.message, /Gemini: Gemini quota/);
    assert.match(e.message, /Claude: no API key/);
    assert.match(e.message, /OpenAI: no API key/);
    return true;
  });
  assert.equal(env.session.pending, undefined, 'pending cleared on failure too');
});

test('Ollama permission missing is reported, not thrown', async () => {
  setSettings({});
  env.perms.value = (origins) => !origins[0].includes('11434');
  installFetch({});
  const report = await engineReport();
  assert.equal(report.ollama, 'not connected yet');
  env.perms.value = true;
});
