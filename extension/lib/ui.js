// Small UI helpers shared by the popup, options and welcome pages.

const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A little burst of electric sparks from an element (skipped with reduced motion or effects off). */
export function sparks(el, { count = 10, enabled = true } = {}) {
  if (!enabled || reducedMotion() || !el) return;
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.className = 'spark';
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
    const dist = 24 + Math.random() * 36;
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    s.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
    document.body.append(s);
    s.addEventListener('animationend', () => s.remove(), { once: true });
  }
}

let toastEl;
let toastTimer;
/** Brief confirmation at the bottom of the page. */
export function toast(text, ms = 1600) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'status');
    document.body.append(toastEl);
  }
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

/** Debounce for auto-save. */
export function debounce(fn, ms = 350) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Human file size. */
export function bytes(n) {
  if (!n) return '';
  const gb = n / 1e9;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`;
}

/** Operating system for download links. */
export function detectOS(nav = globalThis.navigator || {}) {
  const p = `${nav.userAgentData?.platform || ''} ${nav.platform || ''} ${nav.userAgent || ''}`.toLowerCase();
  if (p.includes('win')) return 'windows';
  if (p.includes('mac')) return 'mac';
  if (p.includes('cros')) return 'chromeos';
  if (p.includes('linux')) return 'linux';
  return 'other';
}

export const OLLAMA_DOWNLOADS = {
  windows: { url: 'https://ollama.com/download/OllamaSetup.exe', label: 'Download for Windows' },
  mac: { url: 'https://ollama.com/download/Ollama.dmg', label: 'Download for Mac' },
  linux: { url: 'https://ollama.com/download/linux', label: 'Get it for Linux' },
  chromeos: { url: 'https://ollama.com/download/linux', label: 'Get it (Linux on ChromeOS)' },
  other: { url: 'https://ollama.com/download', label: 'Download Ollama' }
};
