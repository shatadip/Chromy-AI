import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChrome, installFetch } from './helpers.mjs';

const env = installChrome({ settings: { memorySize: 10 } });
const P = await import('../extension/lib/prompts.js');
const { runRequest } = await import('../extension/lib/engine.js');

test('classifyAsk: questions are answered, AI instructions are coached', () => {
  const q = [
    'What is thiamin? and why the lack of it cause problems in our body?',
    'What is a cat?',
    'why is the sky blue',
    'How do vaccines work?',
    'Explain black holes simply',
    'Describe the water cycle',
    'list 5 fruits high in vitamin C',
    'Is coffee bad for you?',
    'difference between RAM and ROM',
    'thiamin deficiency symptoms?'
  ];
  const p = [
    'write a blog post about coffee',
    'make me a logo',
    'Can you write a cover letter for a data analyst job?',
    'Please draft an email to my landlord',
    'You are a travel agent. Plan a 3 day trip to Rome.',
    'Act as a Linux terminal',
    'generate 10 names for a bakery',
    'I want you to create a workout plan',
    'blog post coffee'
  ];
  for (const t of q) assert.equal(P.classifyAsk(t), 'question', t);
  for (const t of p) assert.equal(P.classifyAsk(t), 'prompt', t);
  assert.equal(P.classifyAsk(`What ${'x '.repeat(200)}?`), 'prompt', 'very long input is a prompt');
});

test('extractTip pulls the last Prompt tip line (with small-model decorations)', () => {
  assert.deepEqual(P.extractTip('Thiamin is vitamin B1.\n- a\n\nPrompt tip: say which age group.'), {
    tip: 'say which age group.',
    text: 'Thiamin is vitamin B1.\n- a'
  });
  assert.equal(P.extractTip('x\n**Prompt tip:** ask for sources').tip, 'ask for sources');
  assert.equal(P.extractTip('x\n💡 Prompt tip - be specific').tip, 'be specific');
  assert.deepEqual(P.extractTip('no tip here'), { tip: null, text: 'no tip here' });
  // Real qwen2.5:3b output: tip tacked onto the last sentence.
  assert.deepEqual(P.extractTip('A deficiency causes beriberi and heart problems. Prompt tip: Explore the mechanisms.'), {
    tip: 'Explore the mechanisms.',
    text: 'A deficiency causes beriberi and heart problems.'
  });
  assert.equal(P.extractTip('My prompt tips are elsewhere').tip, null);
});

test('quickTip: the most useful missing ingredient', () => {
  assert.match(P.quickTip('What is thiamin? and why the lack of it cause problems in our body?'), /one question at a time/);
  assert.match(P.quickTip('What is a cat?'), /who it is for/);
  assert.match(P.quickTip('How do vaccines work in the immune system?'), /Say who the answer is for/);
  assert.match(P.quickTip('Explain vaccines for a beginner'), /format/);
  assert.match(P.quickTip('Explain vaccines for a beginner in 5 bullet points'), /sources/);
});

test('a question answer without a tip line gets the fallback tip', async () => {
  env.local.settings = { memorySize: 10, askStyle: 'coach' };
  env.local.memory = [];
  installFetch(ollama('Cats are small carnivorous mammals.'));
  const r = await runRequest({ prompt: 'What is a cat?', mode: 'ask' });
  assert.match(r.tip, /who it is for/);
  assert.equal(r.text, 'Cats are small carnivorous mammals.');
});

test('splitAnswer copes with stray, nested, empty and unclosed fences', () => {
  assert.deepEqual(P.splitAnswer('Improved prompt:\n\n```\nWhat are the functions?\n```\n\n(Improvement: context)'), [
    { type: 'text', value: 'Improved prompt:' },
    { type: 'code', value: 'What are the functions?' },
    { type: 'text', value: '(Improvement: context)' }
  ]);
  // Double-wrapped / nested opening fences act as one (the case seen in real qwen2.5:3b output).
  assert.deepEqual(P.splitAnswer('```plaintext\n```\nDo X\n```'), [{ type: 'code', value: 'Do X' }]);
  assert.deepEqual(P.splitAnswer('Improved prompt:\n\n```\n```\nWhat are the functions?\n```\n```\n\nDone'), [
    { type: 'text', value: 'Improved prompt:' },
    { type: 'code', value: 'What are the functions?' },
    { type: 'text', value: 'Done' }
  ]);
  // Two separate blocks stay separate.
  assert.deepEqual(P.splitAnswer('```\na\n```\nand\n```\nb\n```'), [
    { type: 'code', value: 'a' },
    { type: 'text', value: 'and' },
    { type: 'code', value: 'b' }
  ]);
  // Unclosed final fence still renders as code (streaming / truncated output).
  assert.deepEqual(P.splitAnswer('Try:\n```\nWrite a poem'), [
    { type: 'text', value: 'Try:' },
    { type: 'code', value: 'Write a poem' }
  ]);
  assert.deepEqual(P.splitAnswer('plain'), [{ type: 'text', value: 'plain' }]);
});

const OLLAMA = 'http://127.0.0.1:11434';
const ollama = (answer) => ({
  [`${OLLAMA}/api/tags`]: () => ({ json: { models: [{ name: 'qwen2.5:3b' }] } }),
  [`${OLLAMA}/api/chat`]: () => ({ ndjson: [{ message: { content: answer }, done: true }] })
});
const lastChat = (calls) => JSON.parse(calls.filter((c) => c.url.endsWith('/api/chat')).at(-1).init.body);

test('a question in Ask gets a real answer + tip, no score', async () => {
  env.local.settings = { memorySize: 10, askStyle: 'coach' };
  env.local.memory = [
    { role: 'user', text: 'write a poem', prompt: 'write a poem', mode: 'ask', kind: 'prompt' },
    { role: 'model', text: 'Verdict: vague', mode: 'ask', kind: 'prompt', score: 30 }
  ];
  const calls = installFetch(ollama('Thiamin is vitamin B1.\n- Needed for energy\nPrompt tip: mention your age.'));
  const r = await runRequest({ prompt: 'What is thiamin?', mode: 'ask' });
  assert.equal(r.kind, 'question');
  assert.equal(r.score, null);
  assert.equal(r.tip, 'mention your age.');
  assert.equal(r.text, 'Thiamin is vitamin B1.\n- Needed for energy');
  const chat = lastChat(calls);
  assert.match(chat.messages[0].content, /knowledgeable, friendly assistant/);
  assert.equal(chat.messages.length, 2, 'coaching history is not mixed into a question');
  assert.match(chat.messages[1].content, /Answer the question directly first/);
  const saved = env.local.memory.slice(-2);
  assert.deepEqual([saved[0].kind, saved[0].prompt, saved[1].tip], ['question', 'What is thiamin?', 'mention your age.']);
});

test('askAs overrides the guess both ways', async () => {
  env.local.settings = { memorySize: 10, askStyle: 'coach' };
  env.local.memory = [];
  let calls = installFetch(ollama('Score: 40/100\nVerdict: broad'));
  let r = await runRequest({ prompt: 'What is a cat?', mode: 'ask', askAs: 'prompt' });
  assert.equal(r.kind, 'prompt');
  assert.equal(r.score, 40);
  assert.match(lastChat(calls).messages[0].content, /prompt-engineering coach/);

  calls = installFetch(ollama('A logo is a symbol.\nPrompt tip: name your brand.'));
  r = await runRequest({ prompt: 'make me a logo', mode: 'ask', askAs: 'question' });
  assert.equal(r.kind, 'question');
  assert.match(lastChat(calls).messages[0].content, /knowledgeable/);
});

test('Socrates + question: brief answer and questions prompt', async () => {
  env.local.settings = { memorySize: 10, askStyle: 'socrates' };
  env.local.memory = [];
  const calls = installFetch(ollama('Cats are mammals.\n1. Why?\n2. How?\nPrompt tip: be specific.'));
  const r = await runRequest({ prompt: 'What is a cat?', mode: 'ask' });
  assert.equal(r.tip, 'be specific.');
  assert.match(lastChat(calls).messages[0].content, /friendly Socrates/);
});
