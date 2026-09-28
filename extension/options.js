import { DEFAULTS, getSettings, saveSettings, clearMemory, getTemplates, setTemplates, MAX_TEMPLATES } from './lib/store.js';
import { builtinStatus, downloadBuiltin, OLLAMA_ORIGINS } from './lib/local.js';

const $ = (id) => document.getElementById(id);

function status(el, text, ok = true) {
  el.textContent = text;
  el.className = `status ${ok ? 'ok' : 'err'}`;
}

function showEngine(name, reason) {
  $(`dot-${name}`).className = `dot ${reason ? 'off' : 'ok'}`;
  $(`st-${name}`).textContent = reason ? `— ${reason}` : '— ready';
}

async function refreshEngines() {
  const bs = await builtinStatus();
  showEngine(
    'builtin',
    bs === 'available' ? null : bs === 'unavailable' ? 'not supported on this device' : 'model not downloaded yet'
  );
  $('dlBuiltin').hidden = !(bs === 'downloadable' || bs === 'downloading');

  const res = await chrome.runtime.sendMessage({ type: 'engines' }).catch(() => null);
  if (res?.ok) {
    showEngine('ollama', res.data.ollama);
    showEngine('gemini', res.data.gemini);
  }
}

async function loadOllamaModels() {
  const res = await chrome.runtime.sendMessage({ type: 'ollamaModels' });
  if (!res?.ok) {
    status($('ollamaStatus'), res?.error || 'Could not reach Ollama.', false);
    return;
  }
  const saved = (await getSettings()).ollamaModel;
  const select = $('ollamaModel');
  select.replaceChildren(
    new Option('Auto (first installed)', ''),
    ...res.data.map((name) => new Option(name, name, false, name === saved))
  );
  status(
    $('ollamaStatus'),
    res.data.length ? `Connected. ${res.data.length} model(s) installed.` : 'Connected, but no models yet. Run: ollama pull llama3.2:3b',
    res.data.length > 0
  );
}

function readForm() {
  const memorySize = Math.min(20, Math.max(0, parseInt($('memorySize').value, 10) || 0));
  return {
    provider: $('provider').value,
    ollamaModel: $('ollamaModel').value,
    apiKey: $('apiKey').value.trim(),
    model: $('model').value.trim() || DEFAULTS.model,
    memorySize,
    usePageDefault: $('usePageDefault').checked,
    searchWebDefault: $('searchWebDefault').checked
  };
}

async function loadModels(showStatus = true) {
  const apiKey = $('apiKey').value.trim();
  if (!apiKey) {
    status($('keyStatus'), 'Enter an API key first.', false);
    return null;
  }
  const res = await chrome.runtime.sendMessage({ type: 'listModels', apiKey });
  if (!res?.ok) {
    status($('keyStatus'), res?.error || 'Could not reach Gemini.', false);
    return null;
  }
  const list = $('modelList');
  list.replaceChildren(
    ...res.data.map((m) => {
      const o = document.createElement('option');
      o.value = m.id;
      o.label = m.label;
      return o;
    })
  );
  if (showStatus) status($('keyStatus'), `Key works. ${res.data.length} models available.`);
  return res.data;
}

(async function init() {
  const s = await getSettings();
  $('provider').value = s.provider;
  if (s.ollamaModel) $('ollamaModel').append(new Option(s.ollamaModel, s.ollamaModel, true, true));
  if (await chrome.permissions.contains({ origins: OLLAMA_ORIGINS })) loadOllamaModels();
  refreshEngines();
  $('apiKey').value = s.apiKey;
  $('model').value = s.model;
  $('memorySize').value = s.memorySize;
  $('usePageDefault').checked = s.usePageDefault;
  $('searchWebDefault').checked = s.searchWebDefault;
})();

$('toggleKey').addEventListener('click', () => {
  const input = $('apiKey');
  input.type = input.type === 'password' ? 'text' : 'password';
  $('toggleKey').textContent = input.type === 'password' ? 'Show' : 'Hide';
});

$('testKey').addEventListener('click', () => loadModels(true));
$('loadModels').addEventListener('click', async () => {
  const models = await loadModels(false);
  if (models) {
    status($('keyStatus'), `Loaded ${models.length} models. Click the model box to pick one.`);
    $('model').focus();
  }
});

$('refreshEngines').addEventListener('click', refreshEngines);

$('connectOllama').addEventListener('click', async () => {
  const granted = await chrome.permissions.request({ origins: OLLAMA_ORIGINS });
  if (!granted) {
    status($('ollamaStatus'), 'Permission to talk to localhost:11434 was not granted.', false);
    return;
  }
  await loadOllamaModels();
  refreshEngines();
});

$('dlBuiltin').addEventListener('click', async () => {
  const btn = $('dlBuiltin');
  btn.disabled = true;
  try {
    await downloadBuiltin((p) => (btn.textContent = `Downloading… ${Math.round(p * 100)}%`));
    btn.textContent = 'Downloaded';
  } catch (e) {
    btn.textContent = 'Download failed';
    $('st-builtin').textContent = `— ${e.message}`;
  }
  refreshEngines();
});

$('save').addEventListener('click', async () => {
  await saveSettings(readForm());
  refreshEngines();
  status($('saveStatus'), 'Saved.');
  setTimeout(() => ($('saveStatus').textContent = ''), 2000);
});

$('clearMemory').addEventListener('click', async () => {
  await clearMemory();
  status($('saveStatus'), 'Memory cleared.');
});

$('exportTpl').addEventListener('click', async () => {
  const blob = new Blob([JSON.stringify(await getTemplates(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'chromy-ai-prompts.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('importTpl').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data)) throw new Error('Expected a JSON array.');
    const clean = data
      .filter((t) => t && typeof t.prompt === 'string' && t.prompt.trim())
      .map((t) => ({
        id: crypto.randomUUID(),
        name: String(t.name || t.prompt.slice(0, 40)).slice(0, 60),
        prompt: t.prompt.slice(0, 8000),
        mode: t.mode === 'task' ? 'task' : 'ask',
        usePage: !!t.usePage,
        searchWeb: !!t.searchWeb
      }));
    const merged = [...(await getTemplates()), ...clean].slice(0, MAX_TEMPLATES);
    await setTemplates(merged);
    status($('tplStatus'), `Imported ${clean.length} prompts (${merged.length} total).`);
  } catch (err) {
    status($('tplStatus'), `Import failed: ${err.message}`, false);
  }
  e.target.value = '';
});
