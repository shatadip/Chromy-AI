import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChrome, installFetch } from './helpers.mjs';

installChrome();
const L = await import('../extension/lib/local.js');

test('pickBestModel: biggest model that fits RAM, embedders ignored', () => {
  const models = [
    { name: 'nomic-embed-text:latest', params: '137M' },
    { name: 'qwen2.5:1.5b', params: '1.5B' },
    { name: 'qwen2.5:3b', params: '3.1B' },
    { name: 'qwen2.5:7b', params: '7.6B' }
  ];
  assert.equal(L.pickBestModel(models, 4), 'qwen2.5:1.5b');
  assert.equal(L.pickBestModel(models, 8), 'qwen2.5:3b');
  assert.equal(L.pickBestModel(models, 16), 'qwen2.5:7b');
});

test('pickBestModel: nothing fits → smallest; only embedders → empty', () => {
  assert.equal(L.pickBestModel([{ name: 'llama3.1:70b' }, { name: 'qwen2.5:14b' }], 8), 'qwen2.5:14b');
  assert.equal(L.pickBestModel(['nomic-embed-text', 'mxbai-embed-large-bge'], 8), '');
  assert.equal(L.pickBestModel([], 8), '');
});

test('pickBestModel: family breaks near-ties; plain string names work', () => {
  assert.equal(L.pickBestModel(['mistral:7b', 'qwen2.5:7b'], 16), 'qwen2.5:7b');
  assert.equal(L.pickBestModel(['llama3.2:3b', 'mystery:3b'], 8), 'llama3.2:3b');
});

test('paramBillions reads details or tags', () => {
  assert.equal(L.paramBillions({ params: '3.1B' }), 3.1);
  assert.ok(Math.abs(L.paramBillions({ params: '494.03M' }) - 0.494) < 1e-3);
  assert.equal(L.paramBillions({ name: 'gemma3:4b' }), 4);
  assert.ok(Math.abs(L.paramBillions({ name: 'x', size: 1.9e9 }) - 3.17) < 0.1);
});

test('resolveOllamaModel honours manual choice only while installed', () => {
  const models = ['qwen2.5:3b', 'phi3:mini'];
  assert.equal(L.resolveOllamaModel(models, { ollamaModelManual: true, ollamaModel: 'phi3:mini' }, 8), 'phi3:mini');
  assert.equal(L.resolveOllamaModel(models, { ollamaModelManual: true, ollamaModel: 'gone:1b' }, 8), 'qwen2.5:3b');
  assert.equal(L.resolveOllamaModel(models, { ollamaModelManual: false, ollamaModel: 'phi3:mini' }, 8), 'qwen2.5:3b');
});

test('RAM estimate and starter recommendation', () => {
  assert.equal(L.estimateRamGB({ deviceMemory: 8, hardwareConcurrency: 4 }), 8);
  assert.equal(L.estimateRamGB({ deviceMemory: 8, hardwareConcurrency: 16 }), 16);
  assert.equal(L.estimateRamGB({}), 4);
  assert.equal(L.recommendModel(4), 'qwen2.5:1.5b');
  assert.equal(L.recommendModel(8), 'qwen2.5:3b');
  assert.equal(L.recommendModel(16), 'qwen2.5:7b');
});

test('builtinStatus: a hanging availability() times out as unavailable', async () => {
  globalThis.LanguageModel = { availability: () => new Promise(() => {}) };
  const t = Date.now();
  assert.equal(await L.builtinStatus(100), 'unavailable');
  assert.ok(Date.now() - t < 1000);
  globalThis.LanguageModel = { availability: async () => 'available' };
  assert.equal(await L.builtinStatus(), 'available');
  globalThis.LanguageModel = { availability: async () => { throw new Error('boom'); } };
  assert.equal(await L.builtinStatus(), 'unavailable');
  delete globalThis.LanguageModel;
  assert.equal(await L.builtinStatus(), 'unavailable');
});

test('stripThinking removes finished and unfinished think blocks', () => {
  assert.equal(L.stripThinking('<think>hmm</think>Hello'), 'Hello');
  assert.equal(L.stripThinking('Hi <think>still going'), 'Hi ');
});

test('ollamaPull reports progress and surfaces stream errors', async () => {
  installFetch({
    'http://127.0.0.1:11434/api/pull': () => ({
      ndjson: [{ status: 'pulling manifest' }, { status: 'downloading', total: 100, completed: 50 }, { status: 'success' }]
    })
  });
  const seen = [];
  await L.ollamaPull('qwen2.5:3b', (p) => seen.push(p));
  assert.deepEqual(seen[1], { status: 'downloading', fraction: 0.5 });
  assert.equal(seen.at(-1).status, 'success');

  installFetch({ 'http://127.0.0.1:11434/api/pull': () => ({ ndjson: [{ error: 'disk full' }] }) });
  await assert.rejects(L.ollamaPull('x', () => {}), /disk full/);
});

test('ollamaGenerate: 403 explains OLLAMA_ORIGINS; down explains not running', async () => {
  installFetch({ 'http://127.0.0.1:11434/api/chat': () => ({ status: 403, json: {} }) });
  await assert.rejects(L.ollamaGenerate({ model: 'm', system: 's', history: [], userText: 'u' }), /OLLAMA_ORIGINS/);
  installFetch({});
  await assert.rejects(L.ollamaGenerate({ model: 'm', system: 's', history: [], userText: 'u' }), /not running/);
});

test('ollamaGenerate retries once when the model runner crashes; same num_ctx everywhere', async () => {
  let n = 0;
  const bodies = [];
  installFetch({
    'http://127.0.0.1:11434/api/chat': (_u, init) => {
      bodies.push(JSON.parse(init.body));
      return ++n === 1
        ? { status: 500, json: { error: 'an error was encountered while running the model: read tcp: wsarecv: An existing connection was forcibly closed by the remote host.' } }
        : { ndjson: [{ message: { content: 'ok' }, done: true }] };
    },
    'http://127.0.0.1:11434/api/generate': (_u, init) => {
      bodies.push(JSON.parse(init.body));
      return { json: {} };
    }
  });
  const r = await L.ollamaGenerate({ model: 'm', system: 's', history: [], userText: 'u' });
  assert.equal(r.text, 'ok');
  assert.equal(n, 2);
  await L.ollamaWarmup('m');
  assert.deepEqual(new Set(bodies.map((b) => b.options.num_ctx)), new Set([L.NUM_CTX]), 'no reload-triggering ctx changes');

  n = 0;
  installFetch({ 'http://127.0.0.1:11434/api/chat': () => (++n, { status: 404, json: { error: 'model "x" not found' } }) });
  await assert.rejects(L.ollamaGenerate({ model: 'x', system: 's', history: [], userText: 'u' }), /not found/);
  assert.equal(n, 1, 'ordinary errors are not retried');
});

test('ollamaVersion returns null when down', async () => {
  installFetch({});
  assert.equal(await L.ollamaVersion(), null);
  installFetch({ 'http://127.0.0.1:11434/api/version': () => ({ json: { version: '0.34.4' } }) });
  assert.equal(await L.ollamaVersion(), '0.34.4');
});
