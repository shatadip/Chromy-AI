// Thin wrappers around chrome.storage.local shared by the popup, options page and worker.

export const DEFAULTS = {
  provider: 'auto', // 'auto' | 'builtin' | 'ollama' | 'gemini' (preferred engine; others are fallbacks)
  ollamaModel: '',
  apiKey: '',
  model: 'gemini-flash-latest',
  memorySize: 10,
  usePageDefault: false,
  searchWebDefault: false
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

// Memory: array of { role: 'user' | 'model', text, mode, sources?, at }
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
