// API simulada en memoria para revisar la interfaz sin Supabase (solo dev.html). No toca la red.
import { localISO, addDaysISO } from '../../js/dates.js';

export function createFakeApi({ signedIn = true } = {}) {
  const today = localISO();
  const row = (slug, name, days, price) => ({
    course_slug: slug, course_name: name, start_date: addDaysISO(today, days), end_date: addDaysISO(today, days),
    edition_status: 'active', city: 'Ciudad', location: 'Sede', total_seats: 60, available_seats: 30, base_price: price,
  });
  const rows = [
    row('delega-ia', 'Delega con IA', 5, 99.99),
    row('lab-ads', 'Laboratorio de Ads', 6, 393.99),
    row('mkt-360', 'Estrategias MKT 360', 12, 150),
  ];
  const st = { mode: 'auto', pin_screen: null, drop_active: false, drop_percent: 0, drop_at: null };
  let players = [
    { id: 'p1', name: 'Ana M.', points: 7, last_scored_at: null },
    { id: 'p2', name: 'Carlos R.', points: 6, last_scored_at: null },
    { id: 'p3', name: 'Luisa P.', points: 5, last_scored_at: null },
  ];
  const history = [];
  let session = signedIn ? { user: { email: 'dev@0800.test' } } : null;
  let listener = () => {};
  let seq = 4;
  const wait = (v) => new Promise((r) => setTimeout(() => r(v), 120));
  const sorted = () => [...players].sort((a, b) => b.points - a.points);
  const sync = () => { players = sorted(); };
  const need = () => { if (!session) { const e = new Error('auth'); e.code = 'auth'; throw e; } };

  return {
    signInEmail: () => wait(null),
    async verifyCode(email, token) {
      await wait(null);
      if (token !== '123456') { const e = new Error('Código incorrecto o vencido'); e.code = 'error'; throw e; }
      session = { user: { email } };
      listener(session);
      return {};
    },
    session: async () => session,
    async signOut() { session = null; listener(null); },
    onAuth(cb) { listener = cb; return { data: { subscription: { unsubscribe() {} } } }; },
    async pin(screen) { need(); await wait(); st.mode = 'pin'; st.pin_screen = screen; },
    async auto() { need(); await wait(); st.mode = 'auto'; st.pin_screen = null; },
    async drop(percent) { need(); await wait(); Object.assign(st, { drop_active: true, drop_percent: percent, drop_at: new Date().toISOString() }); },
    async dropOff() { need(); await wait(); Object.assign(st, { drop_active: false, drop_percent: 0 }); },
    async addPlayer(name) { need(); await wait(); players.push({ id: `p${seq++}`, name, points: 0, last_scored_at: null }); sync(); return `p${seq}`; },
    async removePlayer(id) { need(); await wait(); players = players.filter((p) => p.id !== id); },
    async score(id) {
      need(); await wait();
      const p = players.find((x) => x.id === id);
      if (p) { p.points += 1; p.last_scored_at = new Date().toISOString(); history.push(id); sync(); }
    },
    async undo() {
      need(); await wait();
      const id = history.pop();
      const p = players.find((x) => x.id === id);
      if (!p) return null;
      p.points -= 1; sync();
      return { player_id: p.id, name: p.name, points: p.points };
    },
    async resetCompetition() { need(); await wait(); players = []; history.length = 0; },
    live: async () => ({
      state: { ...st },
      players: players.map((p) => ({ id: p.id, name: p.name, points: p.points, lastScoredAt: p.last_scored_at })),
      serverTime: new Date().toISOString(),
    }),
    editions: async () => rows,
  };
}
