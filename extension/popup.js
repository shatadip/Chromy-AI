import {
  getSettings,
  saveSettings,
  getMemory,
  clearMemory,
  getTemplates,
  setTemplates,
  getStats,
  patchStats,
  MAX_TEMPLATES
} from './lib/store.js';
import { runRequest, engineOrder, ENGINE_LABELS } from './lib/engine.js';
import { builtinStatus } from './lib/local.js';
import { QUESTION_IT, splitAnswer } from './lib/prompts.js';
import { pickQuote, LOADING_LINES, scoreLabel, homeUrl } from './lib/fun.js';
import { sparks, toast } from './lib/ui.js';

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
  styleSwitch: $('styleSwitch'),
  usePage: $('usePage'),
  searchWeb: $('searchWeb'),
  send: $('send'),
  saveTpl: $('saveTpl'),
  clearMem: $('clearMem')
};

const PLACEHOLDERS = {
  coach: 'Ask anything, or paste a prompt to score & improve…',
  socrates: 'Ask anything, or paste a prompt for Socrates…',
  task: 'What should I do? e.g. "Summarise this page in 5 bullets"'
};

const STARTERS = [
  { name: 'Summarise this page', prompt: 'Summarise this page in 5 crisp bullets, then list any action items.', mode: 'task', usePage: true },
  { name: "Explain like I'm 12", prompt: "Explain this page like I'm 12, with one everyday analogy.", mode: 'task', usePage: true },
  {
    name: 'Humanize this text',
    prompt: 'Rewrite the text below so it sounds naturally human: varied sentence length, plain words, a little warmth, no clichés. Keep the meaning.\n\n',
    mode: 'task'
  },
  { name: 'Socratic check of my idea', prompt: 'Here is my idea. Question it like Socrates and help me find its weak spots:\n\n', mode: 'ask' }
];

const state = { mode: 'ask', busy: false, settings: null, lineTimer: 0, quote: pickQuote() };

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
    btn.textContent = 'Copied ✓';
    sparks(btn, { count: 6, enabled: state.settings?.effects });
    setTimeout(() => (btn.textContent = label), 1200);
  });
  return btn;
}

function renderBody(parent, text) {
  for (const seg of splitAnswer(text)) {
    if (seg.type === 'code') {
      const pre = document.createElement('pre');
      pre.textContent = seg.value;
      const btn = copyButton(() => seg.value);
      btn.className = 'copy';
      pre.append(btn);
      parent.append(pre);
    } else {
      const span = document.createElement('span');
      inlineText(span, seg.value);
      parent.append(span);
    }
  }
}

function scoreMeter(score) {
  const wrap = document.createElement('div');
  wrap.className = 'score';
  wrap.title = 'How well this prompt will work, as written';
  const num = document.createElement('span');
  num.className = 'num';
  num.textContent = score;
  const track = document.createElement('div');
  track.className = 'track';
  const fill = document.createElement('div');
  fill.className = 'fill';
  track.append(fill);
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = scoreLabel(score);
  wrap.append(num, track, label);
  requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = `${score}%`)));
  return wrap;
}

function actionButton(label, title, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

function messageEl(entry, { last = false, asked = null } = {}) {
  const div = document.createElement('div');
  div.className = `msg ${entry.role}`;
  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent =
    entry.role === 'user'
      ? `You · ${entry.mode || ''}`
      : entry.role === 'error'
        ? 'Oops'
        : `Chromy${entry.via ? ` · ${entry.via}` : ''}`;
  div.append(meta);

  if (entry.role !== 'model') {
    div.append(document.createTextNode(entry.text));
    return div;
  }
  if (Number.isFinite(entry.score)) div.append(scoreMeter(entry.score));
  renderBody(div, entry.text);
  if (entry.tip) {
    const tip = document.createElement('div');
    tip.className = 'tip';
    tip.textContent = `💡 ${entry.tip}`;
    tip.title = 'How to ask this even better next time';
    div.append(tip);
  }
  if (entry.sources?.length) {
    const ol = document.createElement('ol');
    ol.className = 'sources';
    for (const s of entry.sources) {
      if (!/^https?:\/\//.test(s.url)) continue;
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = s.title;
      li.append(a);
      ol.append(li);
    }
    div.append(ol);
  }
  const actions = document.createElement('div');
  actions.className = 'msg-actions';
  actions.append(copyButton(() => entry.text, 'Copy answer'));
  if (last) {
    actions.append(
      actionButton('🤔 Question it', 'Ask Chromy to examine its own answer for mistakes, like Socrates would', () =>
        send({ prompt: QUESTION_IT, mode: entry.mode === 'ask' ? 'ask' : 'task', questionIt: true, askAs: entry.kind })
      )
    );
    // Wrong guess about what you wanted? One click to get the other kind of reply.
    if (entry.mode === 'ask' && asked) {
      actions.append(
        entry.kind === 'question'
          ? actionButton('⚡ Coach this prompt', 'Score and improve it as a prompt instead of answering it', () =>
              send({ prompt: asked, mode: 'ask', askAs: 'prompt' })
            )
          : actionButton('💬 Just answer it', 'Answer this directly instead of coaching the prompt', () =>
              send({ prompt: asked, mode: 'ask', askAs: 'question' })
            )
      );
    }
  }
  div.append(actions);
  return div;
}

function emptyState() {
  const box = document.createElement('div');
  box.className = 'empty';
  const card = document.createElement('div');
  card.className = 'quote-card';
  const q = document.createElement('q');
  q.textContent = state.quote.text;
  const who = document.createElement('div');
  who.className = 'who';
  who.textContent = `— ${state.quote.who}`;
  card.append(q, who);
  if (state.quote.note) {
    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = state.quote.note;
    card.append(note);
  }
  const tips = document.createElement('ul');
  tips.className = 'tips';
  const lines =
    state.mode === 'ask'
      ? state.settings.askStyle === 'socrates'
        ? ['Ask a question: a short answer plus 2 questions to think deeper.', 'Paste a prompt: Socrates asks 3 questions that sharpen it.']
        : ['Ask a question: get an answer plus a 💡 tip to ask even better.', 'Paste a prompt (e.g. "write a blog post…"): get a score, fixes and a better version.']
      : ['Tick "Use this page" to summarise, explain or extract from the tab you are on.', 'Select text first to work on just that part.'];
  for (const l of [...lines, '🤔 "Question it" makes Chromy check its own answer. Humans make mistakes; so do AIs.']) {
    const li = document.createElement('li');
    li.textContent = l;
    tips.append(li);
  }
  box.append(card, tips);
  return box;
}

const seen = new Set(); // messages already on screen: only new ones get the entrance animation
// Your message is keyed by its text (the pending copy and the saved copy must match); replies by time.
const msgKey = (m) => (m.role === 'user' ? `u:${m.text.split('\n\n📄')[0].slice(0, 80)}` : `${m.role}:${m.at || 'pending'}`);
const nearBottom = () => els.thread.scrollHeight - els.thread.scrollTop - els.thread.clientHeight < 60;

/** Full render of the conversation. Streaming updates go through updateTyping() instead. */
async function renderThread({ extra = [], typing = false, partial = '' } = {}) {
  const memory = await getMemory();
  const stick = nearBottom() || typing;
  els.thread.replaceChildren();
  state.typingEl = null;
  if (!memory.length && !extra.length && !typing) els.thread.append(emptyState());
  const all = [...memory, ...extra];
  const lastModel = typing ? -1 : all.map((m) => m.role).lastIndexOf('model');
  all.forEach((m, i) => {
    const el = messageEl(m, { last: i === lastModel && !state.busy, asked: all[i - 1]?.prompt || null });
    const key = msgKey(m);
    if (!seen.has(key)) {
      el.classList.add('enter');
      seen.add(key);
    }
    els.thread.append(el);
  });
  if (typing) {
    const t = document.createElement('div');
    t.className = 'msg model typing enter';
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = 'Chromy';
    const line = document.createElement('div');
    line.className = 'line';
    line.textContent = LOADING_LINES[Math.floor(Date.now() / 1800) % LOADING_LINES.length];
    const body = document.createElement('div');
    body.className = 'stream';
    body.textContent = partial;
    line.hidden = !!partial;
    t.append(meta, line, body);
    els.thread.append(t);
    state.typingEl = t;
  }
  if (stick) els.thread.scrollTop = els.thread.scrollHeight;
}

/** Streaming: change only the text of the reply being written (no re-render, no flicker). */
function updateTyping(prompt, mode, partial) {
  if (!state.typingEl?.isConnected) {
    renderThread({ extra: [{ role: 'user', text: prompt, mode }], typing: true, partial });
    return;
  }
  const stick = nearBottom();
  const body = state.typingEl.querySelector('.stream');
  if (body.textContent !== partial) body.textContent = partial;
  state.typingEl.querySelector('.line').hidden = !!partial;
  if (stick) els.thread.scrollTop = els.thread.scrollHeight;
}

function startLines() {
  clearInterval(state.lineTimer);
  state.lineTimer = setInterval(() => {
    const line = els.thread.querySelector('.typing .line');
    if (line) line.textContent = LOADING_LINES[Math.floor(Date.now() / 1800) % LOADING_LINES.length];
  }, 1800);
}

async function renderTemplates() {
  const templates = await getTemplates();
  els.templateList.replaceChildren();
  els.emptyTemplates.hidden = templates.length > 0;
  for (const t of templates) {
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
  }
}

// ---------- modes ----------

function setStyle(style) {
  els.styleSwitch.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.style === style)));
  if (state.mode === 'ask') els.prompt.placeholder = PLACEHOLDERS[style];
}

async function setMode(mode) {
  state.mode = mode;
  els.tabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  const repeat = mode === 'repeat';
  els.repeatView.hidden = !repeat;
  els.thread.hidden = repeat;
  els.composer.hidden = repeat;
  els.taskToggles.hidden = mode !== 'task';
  els.styleSwitch.hidden = mode !== 'ask';
  if (repeat) return renderTemplates();
  els.prompt.placeholder = mode === 'ask' ? PLACEHOLDERS[state.settings.askStyle] : PLACEHOLDERS.task;
  els.send.firstChild.textContent = mode === 'ask' ? 'Ask ' : 'Run ';
  await renderThread();
  els.prompt.focus();
}

// ---------- actions ----------

async function send({ prompt, mode, usePage = false, searchWeb = false, questionIt = false, askAs }) {
  if (state.busy || !prompt.trim()) return;
  state.busy = true;
  els.send.disabled = true;
  sparks(els.send, { enabled: state.settings.effects });
  const pendingUser = { role: 'user', text: questionIt ? '🤔 Question it' : prompt, mode };
  await renderThread({ extra: [pendingUser], typing: true });
  startLines();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const payload = { prompt, mode, usePage, searchWeb, questionIt, askAs, tabId: tab?.id };
  // Chrome's built-in model is only guaranteed in window contexts, so when it's ready we run
  // the engine chain here; otherwise the service worker runs it (and finishes if the popup closes).
  const res =
    (await builtinStatus()) === 'available'
      ? await runRequest(payload).then(
          (data) => ({ ok: true, data }),
          (e) => ({ ok: false, error: e.message })
        )
      : await chrome.runtime.sendMessage({ type: 'run', payload }).catch((e) => ({ ok: false, error: e.message }));

  clearInterval(state.lineTimer);
  state.busy = false;
  els.send.disabled = false;
  if (res?.ok) {
    if (!questionIt) els.prompt.value = '';
    await renderThread();
    if (res.data.score >= 85) {
      const meters = els.thread.querySelectorAll('.msg.model .score');
      sparks(meters[meters.length - 1], { count: 16, enabled: state.settings.effects });
    }
    if (res.data.stats) renderStreak(res.data.stats);
    setEngineLine(res.data.via);
    maybeNudge(res.data.stats);
  } else {
    await renderThread({ extra: [pendingUser, { role: 'error', text: res?.error || 'Something went wrong.' }] });
    if (/No AI engine/.test(res?.error || '')) $('setupNotice').hidden = false;
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
  // Templates ending in a blank line expect the user to paste something after them.
  if (/\n\s*$/.test(t.prompt)) {
    els.prompt.value = t.prompt;
    els.prompt.focus();
    els.prompt.setSelectionRange(t.prompt.length, t.prompt.length);
    return;
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
  if (templates.length >= MAX_TEMPLATES) return toast(`You can save up to ${MAX_TEMPLATES} prompts. Delete one first.`);
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
  sparks(els.saveTpl, { count: 8, enabled: state.settings.effects });
  toast('Saved to Repeat ★');
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

// ---------- footer, nudges ----------

function renderStreak(s) {
  $('streak').textContent = s.sparks ? `⚡ ${s.sparks} · 🔥 ${s.streak}d` : '';
}

function setEngineLine(via) {
  $('engineLine').textContent = via ? `Answering with ${via}` : '';
}

async function refreshEngineLine() {
  const [res, bs] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'engines' }).catch(() => null),
    builtinStatus()
  ]);
  const report = res?.ok ? res.data : {};
  report.builtin = bs === 'available' ? null : 'unavailable';
  const first = engineOrder(state.settings.provider, false).find((e) => report[e] === null);
  const localReady = report.builtin === null || report.ollama === null;
  if (!first) {
    $('setupText').textContent = 'No AI connected yet. Free local AI takes 2 minutes.';
    $('setupClose').hidden = true;
    $('setupNotice').hidden = false;
  } else if (!localReady && Date.now() > (state.settings.localNudgeUntil || 0)) {
    // Running on a cloud key: gently suggest free, private local AI (dismissible for a week).
    $('setupText').textContent = 'Using your cloud key. Free, private local AI is 2 minutes away.';
    $('setupClose').hidden = false;
    $('setupNotice').hidden = false;
  } else {
    $('setupNotice').hidden = true;
  }
  $('bolt').classList.toggle('live', !!first);
  if (first) setEngineLine(`${ENGINE_LABELS[first]}${first === 'ollama' && report.ollamaModel ? ` · ${report.ollamaModel}` : ''}`);
}

async function maybeNudge(stats) {
  if (!stats || stats.sparks < 5 || (await getStats()).nudged) return;
  const url = await homeUrl();
  $('rateLink').href = url.includes('chromewebstore') ? `${url}/reviews` : url;
  $('rateLink').textContent = url.includes('chromewebstore') ? 'Rate' : 'Star';
  $('nudge').hidden = false;
}
const dismissNudge = () => {
  $('nudge').hidden = true;
  patchStats({ nudged: true });
};
$('nudgeClose').addEventListener('click', dismissNudge);
$('rateLink').addEventListener('click', dismissNudge);

// ---------- wiring ----------

els.tabs.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
els.styleSwitch.querySelectorAll('button').forEach((b) =>
  b.addEventListener('click', async () => {
    state.settings = await saveSettings({ askStyle: b.dataset.style });
    setStyle(b.dataset.style);
    if (!(await getMemory()).length) renderThread();
  })
);
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
  state.quote = pickQuote();
  await renderThread();
  toast('Memory cleared. A fresh start, Socratic style.');
});
$('addStarters').addEventListener('click', async () => {
  const existing = await getTemplates();
  await setTemplates([
    ...STARTERS.map((s) => ({ id: crypto.randomUUID(), usePage: false, searchWeb: false, ...s })),
    ...existing
  ]);
  renderTemplates();
});
$('openSettings').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('setupBtn').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') }));
$('setupClose').addEventListener('click', async () => {
  $('setupNotice').hidden = true;
  state.settings = await saveSettings({ localNudgeUntil: Date.now() + 7 * 86400000 });
});

// Streaming text (Ollama, on-device) shows up via the session "pending" record.
chrome.storage.onChanged.addListener((changes, area) => {
  if (state.mode === 'repeat') return;
  if (area === 'session' && changes.pending) {
    const p = changes.pending.newValue;
    if (p) updateTyping(p.prompt, p.mode, p.partial || '');
    else if (!state.busy) renderThread();
  }
  if (area === 'local' && changes.memory && !state.busy) renderThread();
});

(async function init() {
  state.settings = await getSettings();
  chrome.runtime.sendMessage({ type: 'warmup' }).catch(() => {});
  refreshEngineLine();
  getStats().then(renderStreak);
  els.usePage.checked = state.settings.usePageDefault;
  els.searchWeb.checked = state.settings.searchWebDefault;
  setStyle(state.settings.askStyle);
  await setMode('ask');
  const { pending } = await chrome.storage.session.get('pending');
  if (pending && Date.now() - pending.at < 300000) {
    await setMode(pending.mode);
    await renderThread({ extra: [{ role: 'user', text: pending.prompt, mode: pending.mode }], typing: true, partial: pending.partial });
    startLines();
  }
})();
