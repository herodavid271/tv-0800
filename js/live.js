import { buildPriceRows } from './pricing.js';

export const RECENT_MS = 10000;

export const DEFAULT_LIVE = {
  state: { mode: 'auto', pin_screen: null, drop_active: false, drop_percent: 0, drop_at: null },
  players: [],
  serverTime: null,
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : null);

function normalizePlayer(p) {
  if (!isObj(p)) return null;
  return {
    id: typeof p.id === 'string' ? p.id : String(p.id ?? ''),
    name: String(p.name ?? '').trim().slice(0, 24),
    points: Number.isInteger(p.points) && p.points >= 0 ? p.points : 0,
    lastScoredAt: str(p.last_scored_at),
  };
}

export function normalizeLive(raw) {
  if (!isObj(raw)) return DEFAULT_LIVE;
  const s = isObj(raw.state) ? raw.state : {};
  const pin = typeof s.pin_screen === 'string' && s.pin_screen !== '' ? s.pin_screen : null;
  const pct = s.drop_percent;
  return {
    state: {
      mode: s.mode === 'pin' && pin ? 'pin' : 'auto',
      pin_screen: pin,
      drop_active: s.drop_active === true,
      drop_percent: Number.isInteger(pct) && pct >= 0 && pct <= 90 ? pct : 0,
      drop_at: str(s.drop_at),
    },
    players: Array.isArray(raw.players) ? raw.players.map(normalizePlayer).filter(Boolean) : [],
    serverTime: str(raw.server_time),
  };
}

export function resolveScreen(live, courses, config, todayISO) {
  const s = live?.state ?? DEFAULT_LIVE.state;
  const hidden = config?.hidden_courses ?? [];
  const visible = courses.filter((c) => !hidden.includes(c.slug));

  const p = s.drop_percent;
  if (s.drop_active === true && p >= 1 && p <= 90 && buildPriceRows(visible, p).length > 0) {
    return { screen: { type: 'dropoff', percent: p }, locked: true, key: `dropoff:${p}:${s.drop_at}` };
  }

  if (s.mode === 'pin' && s.pin_screen) {
    const pin = s.pin_screen;
    if (pin === 'calendario' || pin === 'competencia') {
      return { screen: { type: pin }, locked: true, key: `pin:${pin}` };
    }
    if (pin.startsWith('curso:')) {
      const slug = pin.slice(6);
      const course = visible.find((c) => c.slug === slug && !c.finished);
      if (course) return { screen: { type: 'curso', course }, locked: true, key: `pin:${pin}` };
    }
  }
  return null;
}

const ms = (iso) => (iso ? Date.parse(iso) : NaN);

function recentPlayer(live) {
  const now = ms(live.serverTime);
  if (Number.isNaN(now)) return null;
  let best = null;
  let bestT = -Infinity;
  for (const p of live.players) {
    const t = ms(p.lastScoredAt);
    if (!Number.isNaN(t) && t > bestT) { best = p; bestT = t; }
  }
  return best && now - bestT < RECENT_MS ? best : null;
}

function todayCourse(courses, todayISO) {
  return courses.find((c) => !c.finished && c.startDate <= todayISO && todayISO <= c.endDate) ?? null;
}

export function buildLeaderboard(live, courses, todayISO) {
  const players = live?.players ?? [];
  const recentP = recentPlayer({ players, serverTime: live?.serverTime ?? null });
  const today = todayCourse(courses ?? [], todayISO);
  return {
    title: today ? today.name : null,
    leader: players[0] ? { name: players[0].name, points: players[0].points } : null,
    others: players.slice(1, 7).map((p, i) => ({
      rank: i + 2, name: p.name, points: p.points, isRecent: recentP !== null && p === recentP,
    })),
    more: Math.max(0, players.length - 7),
    recent: recentP ? { name: recentP.name } : null,
  };
}

export function liveSignature(live, courses, todayISO) {
  const lb = buildLeaderboard(live, courses, todayISO);
  const recentP = recentPlayer(live);
  return JSON.stringify({
    s: live.state,
    p: live.players.map((p) => [p.id, p.name, p.points]),
    r: recentP ? recentP.id : null,
    t: lb.title,
  });
}
