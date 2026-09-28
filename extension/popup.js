import { getSettings, getMemory, clearMemory, getTemplates, setTemplates, MAX_TEMPLATES } from './lib/store.js';
import { runRequest } from './lib/engine.js';
import { builtinStatus } from './lib/local.js';

const $ = (id) => document.getElementById(id);
const els = {
  tabs: document.querySelectorAll('.tabs button'),
  thread: $('thread'),
  repeatView: $('repeatView'),
  templateList: $('templateList'),
  emptyTemplates: $('emptyTemplates'),
  composer: $('composer'),
  prompt: $('prompt'),
  taskToggles: $('taskToggles'),
  usePage: $('usePage'),
  searchWeb: $('searchWeb'),
  send: $('send'),
  saveTpl: $('saveTpl'),
  clearMem: $('clearMem'),
  noKey: $('noKey')
};

const PLACEHOLDERS = {
  ask: 'Paste a prompt to improve, or ask how to prompt for something…',
  task: 'What should I do? e.g. "Summarise this page in 5 bullets"'
};

const state = { mode: 'ask', busy: false };

// ---------- rendering ----------

function inlineText(parent, text) {
  // Supports **bold**; everything else stays plain text (never innerHTML).
  text.split(/(\*\*[^*\n]+\*\*)/g).forEach((chunk) => {
    if (/^\*\*[^*\n]+\*\*$/.test(chunk)) {
      const b = document.createElement('strong');
      b.textContent = chunk.slice(2, -2);
      parent.append(b);
    } else if (chunk) {
      parent.append(document.createTextNode(chunk));
    }
  });
}

function copyButton(getText, label = 'Copy') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(getText());
    btn.textContent = 'Copied';
    setTimeout(() => (btn.textContent = label), 1200);
  });
  return btn;
}

function renderBody(parent, text) {
  const parts = text.split(/```[\w-]*\n?([\s\S]*?)```/g);
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      const pre = document.createElement('pre');
      const code = part.replace(/\n$/, '');
      pre.textContent = code;
      const btn = copyButton(() => code);
      btn.className = 'copy';
      pre.append(btn);
      parent.append(pre);
    } else if (part.trim()) {
      const span = document.createElement('span');
      inlineText(span, part.replace(/^\n+|\n+$/g, ''));
      parent.append(span);
    }
  });
}

function messageEl(entry) {
  const div = document.createElement('div');
  div.className = `msg ${entry.role}`;
  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent =
    entry.role === 'user'
      ? `You · ${entry.mode || ''}`
      : entry.role === 'error'
        ? 'Error'
        : `Chromy${entry.via ? ` · ${entry.via}` : ''}`;
  div.append(meta);

  if (entry.role === 'model') {
    renderBody(div, entry.text);
    if (entry.sources?.length) {
      const ol = document.createElement('ol');
      ol.className = 'sources';
      entry.sources.forEach((s) => {
        if (!/^https?:\/\//.test(s.url)) return;
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = s.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = s.title;
        li.append(a);
        ol.append(li);
      });
      div.append(ol);
    }
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    actions.append(copyButton(() => entry.text, 'Copy answer'));
    div.append(actions);
  } else {
    div.append(document.createTextNode(entry.text));
  }
  return div;
}

async function renderThread({ extra = [], typing = false, partial = '' } = {}) {
  const memory = await getMemory();
  els.thread.replaceChildren();
  if (!memory.length && !extra.length && !typing) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent =
      state.mode === 'ask'
        ? 'Ask: paste any prompt and get a quick verdict, fixes, and an improved version.'
        : 'Task: run a prompt. Tick "Use this page" to work on the current tab, or "Search the web" for fresh info.';
    els.thread.append(p);
  }
  [...memory, ...extra].forEach((m) => els.thread.append(messageEl(m)));
  if (typing) {
    const t = document.createElement('div');
    t.className = 'msg model typing';
    if (partial) t.append(document.createTextNode(`${partial}\n`));
    els.thread.append(t);
  }
  els.thread.scrollTop = els.thread.scrollHeight;
}

async function renderTemplates() {
  const templates = await getTemplates();
  els.templateList.replaceChildren();
  els.emptyTemplates.hidden = templates.length > 0;
  templates.forEach((t) => {
    const li = document.createElement('li');

    const head = document.createElement('div');
    head.className = 'tpl-head';
    const name = document.createElement('span');
    name.className = 'tpl-name';
    name.textContent = t.name;
    name.title = 'Double-click to rename';
    name.addEventListener('dblclick', () => renameTemplate(t.id, name));
    const badge = document.createElement('span');
    badge.className = 'tpl-badge';
    badge.textContent = [t.mode, t.usePage && 'page', t.searchWeb && 'web'].filter(Boolean).join(' · ');
    head.append(name, badge);

    const prompt = document.createElement('div');
    prompt.className = 'tpl-prompt';
    prompt.textContent = t.prompt;

    const actions = document.createElement('div');
    actions.className = 'tpl-actions';
    const btn = (label, cls, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      if (cls) b.className = cls;
      b.addEventListener('click', fn);
      return b;
    };
    actions.append(
      btn('▶ Run', 'run', () => runTemplate(t)),
      btn('Edit', '', () => loadTemplate(t)),
      btn('Rename', '', () => renameTemplate(t.id, name)),
      btn('Delete', 'del', () => deleteTemplate(t.id))
    );

    li.append(head, prompt, actions);
    els.templateList.append(li);
  });
}

// ---------- modes ----------

async function setMode(mode) {
  state.mode = mode;
  els.tabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  const repeat = mode === 'repeat';
  els.repeatView.hidden = !repeat;
  els.thread.hidden = repeat;
  els.composer.hidden = repeat;
  els.taskToggles.hidden = mode !== 'task';
  if (!repeat) {
    els.prompt.placeholder = PLACEHOLDERS[mode];
    els.send.firstChild.textContent = mode === 'ask' ? 'Ask ' : 'Run ';
    await renderThread();
    els.prompt.focus();
  } else {
    await renderTemplates();
  }
}

// ---------- actions ----------

async function send({ prompt, mode, usePage, searchWeb }) {
  if (state.busy || !prompt.trim()) return;
  state.busy = true;
  els.send.disabled = true;
  const pendingUser = { role: 'user', text: prompt, mode };
  await renderThread({ extra: [pendingUser], typing: true });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const payload = { prompt, mode, usePage, searchWeb, tabId: tab?.id };
  // Chrome's built-in model is only guaranteed in window contexts, so when it's ready we run
  // the engine chain here; otherwise the service worker runs it (and finishes if the popup closes).
  const res =
    (await builtinStatus()) === 'available'
      ? await runRequest(payload).then(
          (data) => ({ ok: true, data }),
          (e) => ({ ok: false, error: e.message })
        )
      : await chrome.runtime.sendMessage({ type: 'run', payload }).catch((e) => ({ ok: false, error: e.message }));

  state.busy = false;
  els.send.disabled = false;
  if (res?.ok) {
    els.prompt.value = '';
    await renderThread();
  } else {
    await renderThread({ extra: [pendingUser, { role: 'error', text: res?.error || 'Something went wrong.' }] });
  }
}

function currentRequest() {
  return {
    prompt: els.prompt.value,
    mode: state.mode,
    usePage: state.mode === 'task' && els.usePage.checked,
    searchWeb: state.mode === 'task' && els.searchWeb.checked
  };
}

async function runTemplate(t) {
  await setMode(t.mode);
  if (t.mode === 'task') {
    els.usePage.checked = !!t.usePage;
    els.searchWeb.checked = !!t.searchWeb;
  }
  await send({ prompt: t.prompt, mode: t.mode, usePage: !!t.usePage, searchWeb: !!t.searchWeb });
}

async function loadTemplate(t) {
  await setMode(t.mode);
  els.prompt.value = t.prompt;
  if (t.mode === 'task') {
    els.usePage.checked = !!t.usePage;
    els.searchWeb.checked = !!t.searchWeb;
  }
}

async function saveTemplate() {
  const req = currentRequest();
  const prompt = req.prompt.trim();
  if (!prompt) {
    els.prompt.focus();
    return;
  }
  const templates = await getTemplates();
  if (templates.length >= MAX_TEMPLATES) {
    await renderThread({ extra: [{ role: 'error', text: `You can save up to ${MAX_TEMPLATES} prompts. Delete one first.` }] });
    return;
  }
  const words = prompt.split(/\s+/).slice(0, 6).join(' ');
  templates.unshift({
    id: crypto.randomUUID(),
    name: words.length < prompt.length ? `${words}…` : words,
    prompt,
    mode: req.mode,
    usePage: req.usePage,
    searchWeb: req.searchWeb
  });
  await setTemplates(templates);
  els.saveTpl.textContent = '★ Saved';
  setTimeout(() => (els.saveTpl.textContent = '★ Save'), 1200);
}

function renameTemplate(id, nameEl) {
  const input = document.createElement('input');
  input.value = nameEl.textContent;
  input.className = 'tpl-name';
  input.maxLength = 60;
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  const commit = async () => {
    const templates = await getTemplates();
    const t = templates.find((x) => x.id === id);
    if (t && input.value.trim()) t.name = input.value.trim();
    await setTemplates(templates);
    await renderTemplates();
  };
  input.addEventListener('blur', commit, { once: true });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') renderTemplates();
  });
}

async function deleteTemplate(id) {
  await setTemplates((await getTemplates()).filter((t) => t.id !== id));
  await renderTemplates();
}

// ---------- wiring ----------

els.tabs.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
els.composer.addEventListener('submit', (e) => {
  e.preventDefault();
  send(currentRequest());
});
els.prompt.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    send(currentRequest());
  }
});
els.saveTpl.addEventListener('click', saveTemplate);
els.clearMem.addEventListener('click', async () => {
  await clearMemory();
  await renderThread();
});
const openSettings = () => chrome.runtime.openOptionsPage();
$('openSettings').addEventListener('click', openSettings);
$('noKeyBtn').addEventListener('click', openSettings);

// An answer that finishes while the popup was closed/reopened shows up here.
// Streaming text (Ollama) shows up via the session "pending" record.
chrome.storage.onChanged.addListener((changes, area) => {
  if (state.mode === 'repeat') return;
  if (area === 'session' && changes.pending) {
    const p = changes.pending.newValue;
    if (p) renderThread({ extra: [{ role: 'user', text: p.prompt, mode: p.mode }], typing: true, partial: p.partial });
    else if (!state.busy) renderThread();
  }
  if (area === 'local' && changes.memory && !state.busy) renderThread();
});

(async function init() {
  const settings = await getSettings();
  chrome.runtime.sendMessage({ type: 'warmup' }).catch(() => {});
  chrome.runtime.sendMessage({ type: 'engines' }).then(async (res) => {
    const anyReady = (await builtinStatus()) === 'available' || (res?.ok && Object.values(res.data).some((r) => r === null));
    els.noKey.hidden = anyReady;
  });
  els.usePage.checked = settings.usePageDefault;
  els.searchWeb.checked = settings.searchWebDefault;
  await setMode('ask');
  const { pending } = await chrome.storage.session.get('pending');
  if (pending && Date.now() - pending.at < 120000) {
    await setMode(pending.mode);
    await renderThread({ extra: [{ role: 'user', text: pending.prompt, mode: pending.mode }], typing: true, partial: pending.partial });
  }
})();
