import { DEFAULTS, getSettings, saveSettings, clearMemory, getTemplates, setTemplates, getStats, MAX_TEMPLATES } from './lib/store.js';
import {
  builtinStatus,
  downloadBuiltin,
  ollamaPermitted,
  ollamaModelList,
  pickBestModel,
  estimateRamGB,
  OLLAMA_ORIGINS
} from './lib/local.js';
import { listModels as geminiModels, pickGeminiModel } from './lib/gemini.js';
import {
  anthropicModels,
  openaiModels,
  pickOpenAIModel,
  ANTHROPIC_ORIGINS,
  OPENAI_ORIGINS
} from './lib/cloud.js';
import { ENGINE_LABELS, engineOrder } from './lib/engine.js';
import { mountWorld } from './lib/world.js';
import { shareLinks, homeUrl } from './lib/fun.js';
import { toast, debounce, bytes, sparks } from './lib/ui.js';

const $ = (id) => document.getElementById(id);
let settings = await getSettings();

// ---------- auto-save ----------

async function save(patch, quiet = false) {
  settings = await saveSettings(patch);
  if (!quiet) toast('Saved ✓');
  refreshEngines();
}
const saveDebounced = debounce(save, 400);

function fillForm() {
  $('provider').value = settings.provider;
  document.querySelector(`input[name="askStyle"][value="${settings.askStyle}"]`).checked = true;
  $('effects').checked = settings.effects;
  $('memorySize').value = settings.memorySize;
  $('usePageDefault').checked = settings.usePageDefault;
  $('searchWebDefault').checked = settings.searchWebDefault;
  $('apiKey').value = settings.apiKey;
  $('anthropicKey').value = settings.anthropicKey;
  $('openaiKey').value = settings.openaiKey;
  setOptions($('model'), [settings.model], settings.model);
  setOptions($('anthropicModel'), [settings.anthropicModel], settings.anthropicModel);
  setOptions($('openaiModel'), settings.openaiModel ? [settings.openaiModel] : [], settings.openaiModel, 'Connect to choose');
}

function setOptions(select, ids, selected, emptyLabel) {
  const list = [...new Set(ids.filter(Boolean))];
  select.replaceChildren(
    ...(list.length ? list.map((id) => new Option(id, id, false, id === selected)) : [new Option(emptyLabel || '—', '')])
  );
}

$('provider').addEventListener('change', (e) => save({ provider: e.target.value }));
document.querySelectorAll('input[name="askStyle"]').forEach((r) =>
  r.addEventListener('change', (e) => save({ askStyle: e.target.value }))
);
$('effects').addEventListener('change', (e) => save({ effects: e.target.checked }));
$('memorySize').addEventListener('input', (e) => {
  const n = Math.min(20, Math.max(0, parseInt(e.target.value, 10) || 0));
  saveDebounced({ memorySize: n });
});
$('usePageDefault').addEventListener('change', (e) => save({ usePageDefault: e.target.checked }));
$('searchWebDefault').addEventListener('change', (e) => save({ searchWebDefault: e.target.checked }));
$('clearMemory').addEventListener('click', async () => {
  await clearMemory();
  toast('Memory cleared. Even Socrates forgets sometimes.');
});

// ---------- "who answers" panel ----------

async function refreshEngines() {
  const [report, bs] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'engines' }).then((r) => (r?.ok ? r.data : {})).catch(() => ({})),
    builtinStatus()
  ]);
  report.builtin = bs === 'available' ? null : bs === 'unavailable' ? 'not supported on this device' : 'model not downloaded yet';

  const order = engineOrder(settings.provider, false);
  const first = order.find((e) => report[e] === null);
  $('engines').replaceChildren(
    ...order.map((e) => {
      const li = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = `dot ${report[e] === null ? 'ok' : 'off'}`;
      const name = document.createElement('strong');
      name.textContent = ENGINE_LABELS[e];
      const reason = document.createElement('span');
      reason.className = 'reason';
      reason.textContent = report[e] === null ? (e === 'ollama' && report.ollamaModel ? report.ollamaModel : 'ready') : report[e] || '…';
      li.append(dot, name, reason);
      return li;
    })
  );
  for (const e of ['gemini', 'anthropic', 'openai', 'ollama', 'builtin']) {
    const d = $(`dot-${e}`);
    if (d) d.className = `dot ${report[e] === null ? 'ok' : 'off'}`;
  }

  const local = report.builtin === null || report.ollama === null;
  if (first) {
    const detail = first === 'ollama' && report.ollamaModel ? ` · ${report.ollamaModel}` : '';
    $('nowTitle').textContent = `Answering with ${ENGINE_LABELS[first]}${detail}`;
    $('nowSub').textContent = local
      ? 'Free and private: your prompts stay on this computer.'
      : 'Using your cloud key. Tip: free local AI keeps prompts on your computer.';
    $('nowBolt').classList.add('live');
  } else {
    $('nowTitle').textContent = 'No AI connected yet';
    $('nowSub').textContent = 'Two minutes, no account, free forever.';
    $('nowBolt').classList.remove('live');
  }
  $('setupBtn').hidden = local;
}

// ---------- Ollama (auto model choice) ----------

async function refreshOllama() {
  const permitted = await ollamaPermitted();
  $('connectOllama').hidden = permitted;
  if (!permitted) {
    $('ollamaStatus').textContent = 'Not connected. Click Connect (or run the setup guide).';
    setOptions($('ollamaModel'), [], '', 'Connect first');
    return;
  }
  await chrome.runtime.sendMessage({ type: 'syncOllamaRule' }).catch(() => {});
  let models;
  try {
    models = await ollamaModelList();
  } catch (e) {
    $('ollamaStatus').textContent = `${e.message} Start Ollama and this updates by itself.`;
    setOptions($('ollamaModel'), [], '', 'Ollama not running');
    return;
  }
  const ram = estimateRamGB();
  const auto = pickBestModel(models, ram);
  $('ollamaStatus').textContent = models.length
    ? `Running · ${models.length} brain${models.length > 1 ? 's' : ''} installed`
    : 'Running, but no brains yet. Click "Get more brains".';

  const select = $('ollamaModel');
  const manual = settings.ollamaModelManual && models.some((m) => m.name === settings.ollamaModel);
  select.replaceChildren(
    new Option(auto ? `Auto: ${auto} (best for this computer)` : 'Auto', ''),
    ...models.map((m) => new Option(`${m.name}${m.size ? ` · ${bytes(m.size)}` : ''}`, m.name))
  );
  select.value = manual ? settings.ollamaModel : '';
  $('ollamaAutoNote').textContent = manual
    ? 'You picked this brain yourself. Choose "Auto" to let Chromy decide again.'
    : 'Chromy picks automatically, and re-picks when you add brains.';
}

$('ollamaModel').addEventListener('change', (e) => {
  const name = e.target.value;
  save({ ollamaModel: name, ollamaModelManual: !!name }).then(refreshOllama);
});
$('connectOllama').addEventListener('click', async () => {
  if (await chrome.permissions.request({ origins: OLLAMA_ORIGINS })) {
    sparks($('connectOllama'));
    await refreshOllama();
    refreshEngines();
  }
});

// ---------- Chrome built-in ----------

async function refreshBuiltin() {
  const bs = await builtinStatus();
  $('builtinStatus').textContent = {
    available: 'Ready on this device.',
    downloadable: 'Supported here. Needs a one-time download from Google.',
    downloading: 'Downloading…',
    unavailable: 'Not supported on this device (needs a recent Chrome and a strong GPU or 16 GB RAM).'
  }[bs];
  $('dlBuiltin').hidden = !(bs === 'downloadable' || bs === 'downloading');
}
$('dlBuiltin').addEventListener('click', async () => {
  const btn = $('dlBuiltin');
  btn.disabled = true;
  try {
    await downloadBuiltin((p) => (btn.textContent = `Downloading… ${Math.round(p * 100)}%`));
    toast("Chrome's AI is ready ⚡");
  } catch (e) {
    $('builtinStatus').textContent = `Download failed: ${e.message}`;
  }
  btn.disabled = false;
  refreshBuiltin();
  refreshEngines();
});

// ---------- API keys ----------

const KEYS = {
  gemini: { key: 'apiKey', model: 'model', origins: null, list: geminiModels, pick: (ms, cur) => (ms.some((m) => m.id === cur) ? cur : pickGeminiModel(ms)) },
  anthropic: {
    key: 'anthropicKey',
    model: 'anthropicModel',
    origins: ANTHROPIC_ORIGINS,
    list: anthropicModels,
    pick: (ms, cur) => (ms.some((m) => m.id === cur) ? cur : ms.find((m) => m.id === DEFAULTS.anthropicModel)?.id || ms[0]?.id || cur)
  },
  openai: { key: 'openaiKey', model: 'openaiModel', origins: OPENAI_ORIGINS, list: openaiModels, pick: (ms, cur) => (ms.some((m) => m.id === cur) ? cur : pickOpenAIModel(ms)) }
};

function keyStatus(engine, text, ok) {
  const el = document.querySelector(`[data-status="${engine}"]`);
  el.textContent = text;
  el.className = `status small ${ok ? 'ok' : 'err'}`;
}

for (const [engine, cfg] of Object.entries(KEYS)) {
  $(cfg.key).addEventListener('input', (e) => saveDebounced({ [cfg.key]: e.target.value.trim() }));
  $(cfg.model).addEventListener('change', (e) => save({ [cfg.model]: e.target.value }));
}

document.querySelectorAll('.reveal').forEach((btn) =>
  btn.addEventListener('click', () => {
    const input = $(btn.dataset.for);
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? 'Show' : 'Hide';
  })
);

document.querySelectorAll('.connect').forEach((btn) =>
  btn.addEventListener('click', async () => {
    const engine = btn.dataset.engine;
    const cfg = KEYS[engine];
    const key = $(cfg.key).value.trim();
    if (!key) return keyStatus(engine, 'Paste your key first.', false);
    // Permission must be requested directly from the click.
    if (cfg.origins && !(await chrome.permissions.request({ origins: cfg.origins }))) {
      return keyStatus(engine, 'Permission was not granted, so Chromy cannot reach this provider.', false);
    }
    btn.disabled = true;
    keyStatus(engine, 'Checking…', true);
    try {
      const models = await cfg.list(key);
      const chosen = cfg.pick(models, settings[cfg.model]);
      setOptions($(cfg.model), models.map((m) => m.id), chosen);
      await save({ [cfg.key]: key, [cfg.model]: chosen }, true);
      keyStatus(engine, `Connected ✓ · ${models.length} models · using ${chosen || '—'}`, true);
      sparks(btn);
    } catch (e) {
      keyStatus(engine, e.message, false);
    }
    btn.disabled = false;
  })
);

// ---------- templates ----------

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
  const el = $('tplStatus');
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
    el.textContent = `Imported ${clean.length} prompts (${merged.length} total).`;
    el.className = 'status small ok';
  } catch (err) {
    el.textContent = `Import failed: ${err.message}`;
    el.className = 'status small err';
  }
  e.target.value = '';
});

// ---------- share ----------

async function initShare() {
  const url = await homeUrl();
  const links = shareLinks(url);
  document.querySelectorAll('[data-share]').forEach((a) => (a.href = links[a.dataset.share]));
  const rate = $('rate');
  if (url.includes('chromewebstore')) rate.href = `${url}/reviews`;
  else {
    rate.href = 'https://github.com/shatadip/Chromy-AI';
    rate.textContent = '⭐ Star on GitHub';
  }
  const s = await getStats();
  $('myStats').textContent = s.sparks
    ? `You've made ${s.sparks} spark${s.sparks === 1 ? '' : 's'} with Chromy · streak ${s.streak} day${s.streak === 1 ? '' : 's'} (best ${s.best}). These numbers never leave your computer.`
    : 'Share Chromy with a friend who writes a lot of prompts.';
}

// ---------- updates ----------

async function initUpdates() {
  const version = chrome.runtime.getManifest().version;
  let fromStore = false;
  try {
    fromStore = (await chrome.management.getSelf()).installType === 'normal';
  } catch {
    /* unavailable in previews */
  }
  $('versionLine').textContent = fromStore
    ? `Version ${version}. Updates install automatically from the Chrome Web Store, as soon as Chromy is idle.`
    : `Version ${version} (loaded from a folder). Chrome doesn't auto-update folder installs: pull the latest code and click ↻ on chrome://extensions, or install from the Chrome Web Store to get automatic updates.`;
  $('checkUpdate').hidden = !fromStore;
}

$('checkUpdate').addEventListener('click', async () => {
  const el = $('updateStatus');
  el.textContent = 'Checking…';
  el.className = 'status small ok';
  const res = await chrome.runtime.sendMessage({ type: 'checkForUpdate', force: true }).catch(() => null);
  const r = res?.ok ? res.data : { status: 'error' };
  el.textContent = {
    update_available: `v${r.version} found: installing as soon as Chromy is idle ⚡`,
    no_update: "You're on the latest version ✓",
    throttled: 'Chrome checked very recently. It will check again automatically soon.'
  }[r.status] || `Couldn't check right now (${r.error || r.status}).`;
  el.className = `status small ${r.status === 'error' ? 'err' : 'ok'}`;
});

// ---------- boot ----------

fillForm();
refreshEngines();
refreshOllama();
refreshBuiltin();
initShare();
initUpdates();
mountWorld($('world')).catch(() => ($('world').hidden = true));
if (location.hash === '#advanced') {
  $('advanced').open = true;
  $('advanced').scrollIntoView({ behavior: 'smooth' });
}
// Pick up changes made elsewhere (setup guide, Ollama started) when the tab regains focus.
addEventListener('focus', async () => {
  settings = await getSettings();
  refreshEngines();
  refreshOllama();
  refreshBuiltin();
});
