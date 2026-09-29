// The Chromy personality: philosophers, electricity, and a healthy respect for human mistakes.

/**
 * Short quotes from classic public-domain translations (Jowett). Two entries are famous
 * misattributions, kept on purpose and flagged: humans misquote, and that's part of the charm.
 */
export const QUOTES = [
  { text: 'The unexamined life is not worth living.', who: 'Socrates, in Plato’s Apology' },
  { text: 'Philosophy begins in wonder.', who: 'Socrates, in Plato’s Theaetetus' },
  { text: 'The beginning is the most important part of the work.', who: 'Plato, Republic' },
  { text: 'Knowledge which is acquired under compulsion obtains no hold on the mind.', who: 'Plato, Republic' },
  { text: 'I know that I know nothing.', who: 'Socrates (a paraphrase of Plato’s Apology)', note: 'Plato never wrote it quite like this. Humans compress.' },
  { text: 'Be kind, for everyone you meet is fighting a hard battle.', who: '“Plato”', note: 'Plato never said this. The internet did. Check your sources, even the nice ones.' },
  { text: 'Wise men speak because they have something to say.', who: '“Plato”', note: 'Also not Plato. Great advice for prompts anyway.' },
  { text: 'A good decision is based on knowledge and not on numbers.', who: 'Plato, Laches' }
];

export const pickQuote = (rand = Math.random) => QUOTES[Math.floor(rand() * QUOTES.length)];

/** Rotating status lines while an answer is on its way. */
export const LOADING_LINES = [
  '⚡ Charging neurons…',
  '🏛 Socrates is asking “but why?”…',
  '📜 Plato is drafting the ideal answer…',
  '🔌 Borrowing electrons from your CPU…',
  '✍️ Making human mistakes… then fixing them…',
  '🌩 Summoning a small, polite thunderstorm…',
  '🧠 Examining the unexamined prompt…',
  '🔋 Almost charged…'
];

/** Friendly label for a 0-100 prompt score. */
export function scoreLabel(score) {
  if (score >= 90) return 'Lightning ⚡';
  if (score >= 75) return 'Sparking';
  if (score >= 55) return 'Warming up';
  if (score >= 35) return 'Flickering';
  return 'Needs a jump-start';
}

// ---------- where in the world (guessed locally, never sent anywhere) ----------

/** Common IANA time zones → ISO country. Covers the zones most people live in. */
const TZ_COUNTRY = {
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Dhaka': 'BD', 'Asia/Karachi': 'PK', 'Asia/Kathmandu': 'NP',
  'Asia/Colombo': 'LK', 'Asia/Shanghai': 'CN', 'Asia/Hong_Kong': 'HK', 'Asia/Taipei': 'TW', 'Asia/Tokyo': 'JP',
  'Asia/Seoul': 'KR', 'Asia/Singapore': 'SG', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Jakarta': 'ID', 'Asia/Manila': 'PH',
  'Asia/Bangkok': 'TH', 'Asia/Ho_Chi_Minh': 'VN', 'Asia/Saigon': 'VN', 'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA',
  'Asia/Tehran': 'IR', 'Asia/Jerusalem': 'IL', 'Asia/Tel_Aviv': 'IL', 'Asia/Qatar': 'QA', 'Asia/Kabul': 'AF',
  'Asia/Tashkent': 'UZ', 'Asia/Almaty': 'KZ', 'Asia/Yangon': 'MM', 'Asia/Baghdad': 'IQ', 'Asia/Amman': 'JO',
  'Asia/Beirut': 'LB', 'Asia/Kuwait': 'KW', 'Asia/Muscat': 'OM', 'Asia/Baku': 'AZ', 'Asia/Tbilisi': 'GE', 'Asia/Yerevan': 'AM',
  'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Madrid': 'ES',
  'Europe/Lisbon': 'PT', 'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE', 'Europe/Zurich': 'CH',
  'Europe/Vienna': 'AT', 'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI',
  'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ', 'Europe/Budapest': 'HU', 'Europe/Bucharest': 'RO', 'Europe/Sofia': 'BG',
  'Europe/Athens': 'GR', 'Europe/Istanbul': 'TR', 'Europe/Kiev': 'UA', 'Europe/Kyiv': 'UA', 'Europe/Moscow': 'RU',
  'Europe/Belgrade': 'RS', 'Europe/Zagreb': 'HR', 'Europe/Bratislava': 'SK', 'Europe/Ljubljana': 'SI', 'Europe/Vilnius': 'LT',
  'Europe/Riga': 'LV', 'Europe/Tallinn': 'EE', 'Europe/Minsk': 'BY', 'Europe/Luxembourg': 'LU',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US',
  'America/Phoenix': 'US', 'America/Anchorage': 'US', 'America/Detroit': 'US', 'Pacific/Honolulu': 'US',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA',
  'America/Mexico_City': 'MX', 'America/Bogota': 'CO', 'America/Lima': 'PE', 'America/Santiago': 'CL',
  'America/Argentina/Buenos_Aires': 'AR', 'America/Buenos_Aires': 'AR', 'America/Sao_Paulo': 'BR', 'America/Caracas': 'VE',
  'America/Guayaquil': 'EC', 'America/La_Paz': 'BO', 'America/Montevideo': 'UY', 'America/Asuncion': 'PY',
  'America/Guatemala': 'GT', 'America/Costa_Rica': 'CR', 'America/Panama': 'PA', 'America/Havana': 'CU',
  'America/Santo_Domingo': 'DO', 'America/Puerto_Rico': 'PR', 'America/Jamaica': 'JM',
  'Africa/Lagos': 'NG', 'Africa/Cairo': 'EG', 'Africa/Johannesburg': 'ZA', 'Africa/Nairobi': 'KE', 'Africa/Casablanca': 'MA',
  'Africa/Algiers': 'DZ', 'Africa/Tunis': 'TN', 'Africa/Accra': 'GH', 'Africa/Addis_Ababa': 'ET', 'Africa/Dar_es_Salaam': 'TZ',
  'Africa/Kampala': 'UG', 'Africa/Kinshasa': 'CD', 'Africa/Abidjan': 'CI', 'Africa/Dakar': 'SN', 'Africa/Harare': 'ZW',
  'Africa/Lusaka': 'ZM', 'Africa/Khartoum': 'SD', 'Africa/Luanda': 'AO', 'Africa/Maputo': 'MZ', 'Africa/Douala': 'CM',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU', 'Australia/Perth': 'AU',
  'Australia/Adelaide': 'AU', 'Pacific/Auckland': 'NZ', 'Pacific/Fiji': 'FJ'
};

/**
 * Best local guess of the user's country: time zone first, then the language region.
 * Deliberately imperfect (VPNs, travel, en-US defaults) and never sent anywhere.
 */
export function guessCountry(tz = safeTz(), languages = globalThis.navigator?.languages || []) {
  if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
  for (const lang of languages) {
    const region = String(lang).split('-')[1];
    if (region && /^[A-Z]{2}$/i.test(region)) return region.toUpperCase();
  }
  return null;
}

function safeTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return '';
  }
}

export function countryName(code, locale) {
  try {
    return new Intl.DisplayNames([locale || 'en'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

// ---------- community stats (public, aggregate, published in the repo) ----------

export const STATS_URL = 'https://raw.githubusercontent.com/shatadip/Chromy-AI/main/stats/countries.json';

/** Pure: validates a stats file into [{ code, count }] sorted by count, top first. */
export function parseStats(json) {
  const countries = json && typeof json.countries === 'object' ? json.countries : {};
  return Object.entries(countries)
    .filter(([code, n]) => /^[A-Z]{2}$/.test(code) && Number.isFinite(n) && n > 0)
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count);
}

/** Fetches the public stats file (no data is sent; it's a plain GET of a JSON file). */
export async function fetchStats(timeoutMs = 4000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(STATS_URL, { signal: ctrl.signal, cache: 'no-store', credentials: 'omit' });
    if (!res.ok) return { countries: [], updated: null };
    const json = await res.json();
    return { countries: parseStats(json), updated: json.updated || null };
  } catch {
    return { countries: [], updated: null };
  } finally {
    clearTimeout(t);
  }
}

// ---------- sharing ----------

export const SHARE_TEXT =
  'Chromy AI makes my AI prompts better in seconds. Runs on free local AI (Ollama / Chrome on-device), no key needed. ⚡';
export const REPO_URL = 'https://github.com/shatadip/Chromy-AI';

export function shareLinks(url) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(SHARE_TEXT);
  return {
    x: `https://twitter.com/intent/tweet?text=${t}&url=${u}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    whatsapp: `https://wa.me/?text=${t}%20${u}`,
    reddit: `https://www.reddit.com/submit?url=${u}&title=${t}`
  };
}

/** Store page when installed from the Chrome Web Store; the GitHub repo otherwise. */
export async function homeUrl() {
  try {
    const self = await chrome.management.getSelf();
    if (self.installType === 'normal') return `https://chromewebstore.google.com/detail/${chrome.runtime.id}`;
  } catch {
    /* management.getSelf unavailable (tests/preview) */
  }
  return REPO_URL;
}
