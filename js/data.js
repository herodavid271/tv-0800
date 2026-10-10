const CACHE_KEY = 'tv0800.cache.v1';

export const DEFAULT_CONFIG = {
  screens: ['calendario', 'cursos'],
  seconds_per_screen: 12,
  hidden_courses: [],
  message: null,
  discount_active: false,
  discount_percent: 0,
  announcement_title: null,
  announcement_note: null,
  announcement_date: null,
};

function cleanText(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t || null;
}

export function normalizeConfig(c) {
  const o = { ...DEFAULT_CONFIG, ...(c ?? {}) };
  if (!Array.isArray(o.screens)) o.screens = [...DEFAULT_CONFIG.screens];
  if (!Array.isArray(o.hidden_courses)) o.hidden_courses = [];
  const secs = Number(o.seconds_per_screen);
  o.seconds_per_screen = secs >= 3 ? secs : DEFAULT_CONFIG.seconds_per_screen;
  o.discount_active = o.discount_active === true;
  const pct = o.discount_percent;
  o.discount_percent = Number.isInteger(pct) && pct >= 0 && pct <= 90 ? pct : 0;
  o.announcement_title = cleanText(o.announcement_title);
  o.announcement_note = cleanText(o.announcement_note);
  o.announcement_date = typeof o.announcement_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.announcement_date)
    ? o.announcement_date : null;
  return o;
}

function toCourse(r, finished) {
  return {
    slug: r.course_slug,
    name: r.course_name,
    startDate: r.start_date,
    endDate: r.end_date ?? r.start_date,
    city: r.city,
    location: r.location,
    totalSeats: r.total_seats,
    availableSeats: r.available_seats,
    basePrice: r.base_price != null && r.base_price !== '' ? Number(r.base_price) : null,
    finished,
  };
}

export function pickCourses(rows, todayISO) {
  const bySlug = new Map();
  for (const r of rows) {
    if (!bySlug.has(r.course_slug)) bySlug.set(r.course_slug, []);
    bySlug.get(r.course_slug).push(r);
  }
  const out = [];
  for (const list of bySlug.values()) {
    const upcoming = list
      .filter((r) => r.edition_status === 'active' && (r.end_date ?? r.start_date) >= todayISO)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    if (upcoming.length) {
      out.push(toCourse(upcoming[0], false));
    } else {
      const latest = [...list].sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
      out.push(toCourse(latest, true));
    }
  }
  return out.sort((a, b) => Number(a.finished) - Number(b.finished) || a.startDate.localeCompare(b.startDate));
}

function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) return AbortSignal.timeout(ms);
  if (typeof AbortController === 'undefined') return undefined;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  t.unref?.();
  return controller.signal;
}

export function createClient({ url, key, fetchImpl = (...a) => fetch(...a) }) {
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  async function call(path, init = {}) {
    const res = await fetchImpl(`${url}/rest/v1/${path}`, { headers, signal: timeoutSignal(10000), ...init });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  return {
    editions: () => call('rpc/tv_ediciones', { method: 'POST', body: '{}' }),
    config: async () => {
      const rows = await call('tv_config?id=eq.1&select=*');
      return rows[0] ?? null;
    },
  };
}

function readCache(storage) {
  try {
    const raw = storage?.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function loadSnapshot(client, storage) {
  try {
    const rows = await client.editions();
    let config;
    try {
      config = await client.config();
    } catch {
      config = readCache(storage)?.config ?? null;
    }
    const snap = { rows, config: normalizeConfig(config), savedAt: Date.now() };
    try {
      storage?.setItem(CACHE_KEY, JSON.stringify(snap));
    } catch {}
    return { rows: snap.rows, config: snap.config, online: true };
  } catch {
    const cached = readCache(storage);
    if (!cached || !Array.isArray(cached.rows)) return null;
    return { rows: cached.rows, config: normalizeConfig(cached.config), online: false };
  }
}
