// First-run setup a child can follow: allow → install Ollama → download a brain → say hi.
// Everything is detected automatically; each step unlocks the next.
import {
  builtinStatus,
  downloadBuiltin,
  ollamaPermitted,
  ollamaVersion,
  ollamaModelList,
  ollamaPull,
  pickBestModel,
  recommendModel,
  estimateRamGB,
  STARTER_MODELS,
  OLLAMA_ORIGINS
} from './lib/local.js';
import { runRequest } from './lib/engine.js';
import { saveSettings } from './lib/store.js';
import { pickQuote, LOADING_LINES } from './lib/fun.js';
import { mountWorld } from './lib/world.js';
import { sparks, detectOS, OLLAMA_DOWNLOADS } from './lib/ui.js';

const $ = (id) => document.getElementById(id);
const steps = ['step1', 'step2', 'step3', 'step4'].map($);
const state = { permitted: false, ollamaUp: false, brain: '', chosen: '', pulling: null, poll: 0, useBuiltin: false };

// ---------- presentation ----------

function renderQuote() {
  const q = pickQuote();
  const el = $('quote');
  el.textContent = `“${q.text}” — ${q.who}`;
  if (q.note) {
    const n = document.createElement('span');
    n.className = 'note';
    n.textContent = `(${q.note})`;
    el.append(n);
  }
}

function setSteps(doneCount) {
  steps.forEach((s, i) => {
    s.classList.toggle('done', i < doneCount && i < 3);
    s.classList.toggle('active', i === doneCount);
    s.classList.toggle('locked', i > doneCount);
  });
}

function renderBrains() {
  const ram = estimateRamGB();
  const rec = recommendModel(ram);
  state.chosen ||= rec;
  $('brainIntro').textContent = `Pick a brain. I picked the best one for your computer (about ${ram >= 16 ? '16+' : ram} GB of memory).`;
  $('brains').replaceChildren(
    ...STARTER_MODELS.map((m) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'brain';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(m.name === state.chosen));
      const title = document.createElement('strong');
      title.textContent = m.label.replace(' (recommended)', '');
      const meta = document.createElement('span');
      meta.textContent = `${m.name} · ${m.size}`;
      b.append(title, meta);
      if (m.name === rec) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = ' · best for you';
        meta.append(tag);
      }
      b.addEventListener('click', () => {
        state.chosen = m.name;
        renderBrains();
      });
      return b;
    })
  );
  const size = STARTER_MODELS.find((m) => m.name === state.chosen)?.size;
  $('pull').textContent = `Download brain (${size})`;
}

// ---------- detection ----------

async function refresh() {
  if (state.useBuiltin) return;
  state.permitted = await ollamaPermitted();
  if (!state.permitted) return setSteps(0);

  await chrome.runtime.sendMessage({ type: 'syncOllamaRule' }).catch(() => {});
  state.ollamaUp = !!(await ollamaVersion());
  if (!state.ollamaUp) {
    setSteps(1);
    startPolling();
    return;
  }
  stopPolling();

  const models = await ollamaModelList().catch(() => []);
  state.brain = pickBestModel(models, estimateRamGB());
  if (!state.brain) {
    renderBrains();
    return setSteps(2);
  }
  $('brainDone').textContent = `✓ Brain ready: ${state.brain} (Chromy picked it automatically)`;
  setSteps(3);
}

function startPolling() {
  if (state.poll) return;
  state.poll = setInterval(async () => {
    if (await ollamaVersion()) {
      stopPolling();
      sparks($('step2'), { count: 14 });
      refresh();
    }
  }, 2000);
}
function stopPolling() {
  clearInterval(state.poll);
  state.poll = 0;
}

// ---------- actions ----------

$('allow').addEventListener('click', async () => {
  const granted = await chrome.permissions.request({ origins: OLLAMA_ORIGINS });
  if (granted) sparks($('allow'));
  refresh();
});

$('pull').addEventListener('click', async () => {
  const ctrl = new AbortController();
  state.pulling = ctrl;
  $('pull').disabled = true;
  $('cancelPull').hidden = false;
  $('progress').hidden = false;
  let line = 0;
  let last = '';
  const fun = setInterval(() => (line = (line + 1) % LOADING_LINES.length), 3000);
  try {
    await ollamaPull(
      state.chosen,
      ({ status, fraction }) => {
        if (fraction !== null) $('barFill').style.width = `${Math.max(2, fraction * 100).toFixed(1)}%`;
        const pct = fraction !== null ? ` ${Math.floor(fraction * 100)}%` : '';
        const text = `${LOADING_LINES[line]} ${status}${pct}`;
        if (text !== last) $('pullStatus').textContent = last = text;
      },
      ctrl.signal
    );
    $('barFill').style.width = '100%';
    await saveSettings({ ollamaModel: '', ollamaModelManual: false });
    sparks($('step3'), { count: 18 });
    refresh();
  } catch (e) {
    $('pullStatus').textContent = e.name === 'AbortError' ? 'Cancelled. You can try again any time.' : `Oops: ${e.message}`;
  } finally {
    clearInterval(fun);
    state.pulling = null;
    $('pull').disabled = false;
    $('cancelPull').hidden = true;
  }
});
$('cancelPull').addEventListener('click', () => state.pulling?.abort());

$('tryIt').addEventListener('click', async () => {
  const btn = $('tryIt');
  const out = $('answer');
  btn.disabled = true;
  out.hidden = false;
  out.textContent = LOADING_LINES[0];
  const onChange = (changes, area) => {
    const p = area === 'session' && changes.pending?.newValue;
    if (p?.partial) out.textContent = p.partial;
  };
  chrome.storage.onChanged.addListener(onChange);
  const payload = {
    prompt: 'Introduce yourself in two short, cheerful sentences, as a Socrates who loves electricity and good prompts.',
    mode: 'task'
  };
  const res =
    (await builtinStatus()) === 'available'
      ? await runRequest(payload).then((data) => ({ ok: true, data }), (e) => ({ ok: false, error: e.message }))
      : await chrome.runtime.sendMessage({ type: 'run', payload }).catch((e) => ({ ok: false, error: e.message }));
  chrome.storage.onChanged.removeListener(onChange);
  btn.disabled = false;
  if (res?.ok) {
    out.textContent = `${res.data.text}\n\n— via ${res.data.via}`;
    $('finish').hidden = false;
    btn.textContent = 'Try again';
    sparks(btn, { count: 22 });
    await saveSettings({ onboarded: true });
  } else {
    out.textContent = `Hmm, that didn't work:\n${res?.error || 'unknown error'}`;
  }
});

// Chrome's built-in AI path.
$('builtinGo').addEventListener('click', async () => {
  const btn = $('builtinGo');
  btn.disabled = true;
  if ((await builtinStatus()) !== 'available') {
    $('builtinBar').hidden = false;
    try {
      await downloadBuiltin((p) => ($('builtinBar').firstElementChild.style.width = `${(p * 100).toFixed(1)}%`));
    } catch (e) {
      $('builtinNote').textContent = `Download failed: ${e.message}`;
      btn.disabled = false;
      return;
    }
  }
  await saveSettings({ provider: 'builtin' });
  sparks(btn, { count: 16 });
  state.useBuiltin = true;
  steps.slice(0, 3).forEach((s) => (s.hidden = true));
  steps[3].querySelector('.num').textContent = '✓';
  setSteps(3);
  steps[3].scrollIntoView({ behavior: 'smooth', block: 'center' });
});
$('showOllama').addEventListener('click', (e) => {
  e.preventDefault();
  state.useBuiltin = false;
  steps.forEach((s) => (s.hidden = false));
  $('ollamaPath').hidden = false;
  refresh();
});

// ---------- boot ----------

(async function init() {
  renderQuote();
  const os = detectOS();
  const dl = OLLAMA_DOWNLOADS[os];
  $('download').href = dl.url;
  $('download').textContent = dl.label;
  $('linuxHint').hidden = !['linux', 'chromeos'].includes(os);

  const bs = await builtinStatus();
  if (bs !== 'unavailable') {
    $('builtinPath').hidden = false;
    $('builtinNote').textContent =
      bs === 'available' ? "It's ready right now." : 'It needs a one-time download from Google (a few GB).';
    $('ollamaPath').hidden = true;
  }
  await refresh();
  mountWorld($('world')).catch(() => ($('world').hidden = true));
})();

addEventListener('focus', () => !state.pulling && refresh());
