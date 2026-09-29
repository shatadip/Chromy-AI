// Thin wrappers around chrome.storage.local shared by the popup, options, welcome page and worker.

export const DEFAULTS = {
  provider: 'auto', // 'auto' | 'builtin' | 'ollama' | 'gemini' | 'anthropic' | 'openai' (preferred; others are fallbacks)
  ollamaModel: '', // '' = auto-pick the best installed model
  ollamaModelManual: false, // true once the user picks a model themselves
  apiKey: '', // Gemini
  model: 'gemini-flash-latest',
  anthropicKey: '',
  anthropicModel: 'claude-opus-5-5',
  openaiKey: '',
  openaiModel: '', // '' = auto-pick from the account's model list
  memorySize: 10,
  usePageDefault: false,
  searchWebDefault: false,
  askStyle: 'coach', // 'coach' | 'socrates'
  effects: true, // sparks & glow (always off with prefers-reduced-motion)
  onboarded: false,
  localNudgeUntil: 0 // "try free local AI" hint in the popup is snoozed until this time
};

export const MAX_TEMPLATES = 50;

export async function getSettings() {
  const stored = await chrome.storage.local.get('settings');
  return { ...DEFAULTS, ...(stored.settings || {}) };
}

export async function saveSettings(patch) {
  const settings = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings });
  return settings;
}

// Memory: array of { role: 'user' | 'model', text, mode, sources?, via?, score?, at }
export async function getMemory() {
  const { memory } = await chrome.storage.local.get('memory');
  return Array.isArray(memory) ? memory : [];
}

export async function pushMemory(entries, limitTurns) {
  const memory = [...(await getMemory()), ...entries];
  // One turn = user message + model reply.
  const keep = Math.max(0, limitTurns) * 2;
  const trimmed = keep === 0 ? [] : memory.slice(-keep);
  await chrome.storage.local.set({ memory: trimmed });
  return trimmed;
}

export async function clearMemory() {
  await chrome.storage.local.set({ memory: [] });
}

// Templates: array of { id, name, prompt, mode, usePage, searchWeb }
export async function getTemplates() {
  const { templates } = await chrome.storage.local.get('templates');
  return Array.isArray(templates) ? templates : [];
}

export async function setTemplates(templates) {
  await chrome.storage.local.set({ templates: templates.slice(0, MAX_TEMPLATES) });
}

// Sparks: purely local fun counters (never leave the device).
export const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Pure: next stats after one answer on `today` (YYYY-MM-DD). */
export function nextStats(stats, today) {
  const s = { sparks: 0, streak: 0, lastDay: '', best: 0, ...(stats || {}) };
  s.sparks += 1;
  if (s.lastDay !== today) {
    const yesterday = localDay(new Date(new Date(`${today}T12:00:00`).getTime() - 86400000));
    s.streak = s.lastDay === yesterday ? s.streak + 1 : 1;
    s.lastDay = today;
  }
  s.best = Math.max(s.best, s.streak);
  return s;
}

export async function getStats() {
  const { stats } = await chrome.storage.local.get('stats');
  return { sparks: 0, streak: 0, lastDay: '', best: 0, nudged: false, ...(stats || {}) };
}

export async function bumpStats() {
  const stats = nextStats(await getStats(), localDay());
  await chrome.storage.local.set({ stats });
  return stats;
}

export async function patchStats(patch) {
  await chrome.storage.local.set({ stats: { ...(await getStats()), ...patch } });
}
