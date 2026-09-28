import { DEFAULTS, getSettings, saveSettings, clearMemory, getTemplates, setTemplates, MAX_TEMPLATES } from './lib/store.js';

const $ = (id) => document.getElementById(id);

function status(el, text, ok = true) {
  el.textContent = text;
  el.className = `status ${ok ? 'ok' : 'err'}`;
}

function readForm() {
  const memorySize = Math.min(20, Math.max(0, parseInt($('memorySize').value, 10) || 0));
  return {
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

$('save').addEventListener('click', async () => {
  await saveSettings(readForm());
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
