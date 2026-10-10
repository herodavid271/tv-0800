import test from 'node:test';
import assert from 'node:assert/strict';
import { DROP_PERCENTS, DEFAULT_DROP, screenButtons, describeNow, dropPreview, playerRows } from '../admin/js/model.js';
import { createApi, MSG_FORBIDDEN, MSG_OFFLINE } from '../admin/js/api.js';
import { normalizeLive } from '../js/live.js';

const course = (slug, name, startDate, over = {}) => ({
  slug, name, startDate, endDate: startDate, basePrice: 100, finished: false, ...over,
});
const COURSES = [
  course('a', 'Delega con IA', '2026-10-15', { basePrice: 99.99 }),
  course('b', 'Laboratorio de Ads', '2026-10-16', { basePrice: 393.99 }),
  course('c', 'Estrategias', '2026-10-22', { basePrice: 50 }),
  course('z', 'Viejo', '2026-01-01', { finished: true }),
];
const live = (state = {}, players = []) => normalizeLive({
  server_time: '2026-10-10T18:00:00+00:00',
  state: { mode: 'auto', pin_screen: null, drop_active: false, drop_percent: 0, drop_at: null, ...state },
  players,
});

test('valores por defecto del DROP', () => {
  assert.deepEqual(DROP_PERCENTS, [10, 20, 30, 40, 50]);
  assert.equal(DEFAULT_DROP, 30);
});

test('screenButtons: calendario, un curso próximo cada uno y competencia', () => {
  const b = screenButtons(COURSES, live());
  assert.deepEqual(b.map((x) => x.id), ['calendario', 'curso:a', 'curso:b', 'curso:c', 'competencia']);
  assert.equal(b[1].label, 'Delega con IA');
  assert.equal(b[1].sub, '15 oct');
  assert.equal(b[4].sub, 'En vivo');
  assert.ok(b.every((x) => x.active === false));
});

test('screenButtons: activo según lo fijado', () => {
  const b = screenButtons(COURSES, live({ mode: 'pin', pin_screen: 'curso:b' }));
  assert.deepEqual(b.filter((x) => x.active).map((x) => x.id), ['curso:b']);
  assert.equal(screenButtons(COURSES, live({ mode: 'pin', pin_screen: 'competencia' })).at(-1).active, true);
});

test('describeNow: automático, fijos y DROP', () => {
  assert.equal(describeNow(live(), COURSES), 'Automático');
  assert.equal(describeNow(live({ mode: 'pin', pin_screen: 'calendario' }), COURSES), 'Calendario (fijo)');
  assert.equal(describeNow(live({ mode: 'pin', pin_screen: 'competencia' }), COURSES), 'Competencia (fijo)');
  assert.equal(describeNow(live({ mode: 'pin', pin_screen: 'curso:a' }), COURSES), 'Delega con IA (fijo)');
  assert.equal(describeNow(live({ drop_active: true, drop_percent: 30 }), COURSES), 'DROP −30 % activo');
});

test('dropPreview: 2 líneas y "n más"', () => {
  const p = dropPreview(COURSES, 30);
  assert.equal(p.lines.length, 2);
  assert.deepEqual(p.lines[0], { name: 'Delega con IA', before: '$99.99', after: '$69.99' });
  assert.equal(p.lines[1].after, '$275.79');
  assert.equal(p.more, 1);
});

test('dropPreview: sin precios o con uno solo', () => {
  assert.deepEqual(dropPreview([course('x', 'X', '2026-10-15', { basePrice: null })], 30), { lines: [], more: 0 });
  const one = dropPreview([COURSES[0]], 10);
  assert.equal(one.lines.length, 1);
  assert.equal(one.more, 0);
});

test('playerRows: posición, nombre y puntos en orden', () => {
  const rows = playerRows(live({}, [
    { id: 'p1', name: 'Ana', points: 7, last_scored_at: null },
    { id: 'p2', name: 'Luis', points: 7, last_scored_at: null },
  ]));
  assert.deepEqual(rows, [
    { id: 'p1', rank: 1, name: 'Ana', points: 7 },
    { id: 'p2', rank: 2, name: 'Luis', points: 7 },
  ]);
  assert.deepEqual(playerRows(live()), []);
});

// ---- api.js con una librería falsa
function fakeLib({ rpcResult, rpcError, rpcThrow } = {}) {
  const calls = [];
  const lib = {
    createClient: () => ({
      rpc: async (name, args) => {
        calls.push([name, args]);
        if (rpcThrow) throw rpcThrow;
        return { data: rpcResult ?? null, error: rpcError ?? null };
      },
      auth: {
        signInWithOtp: async (a) => { calls.push(['otp', a]); return { error: null }; },
        verifyOtp: async (a) => { calls.push(['verify', a]); return { data: { session: {} }, error: null }; },
        getSession: async () => ({ data: { session: { user: {} } } }),
        onAuthStateChange: (cb) => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({ error: null }),
      },
    }),
  };
  return { lib, calls };
}

test('api: forbidden se mapea al mensaje en español', async () => {
  const { lib } = fakeLib({ rpcError: { message: 'forbidden' } });
  const api = createApi({ url: 'u', key: 'k', supabaseLib: lib });
  await assert.rejects(api.auto(), (e) => e.message === MSG_FORBIDDEN && e.code === 'forbidden');
  assert.equal(MSG_FORBIDDEN, 'Tu usuario no tiene permiso para controlar el TV');
});

test('api: fallo de red se mapea a "Sin conexión, reintenta"', async () => {
  const { lib } = fakeLib({ rpcThrow: new TypeError('Failed to fetch') });
  const api = createApi({ url: 'u', key: 'k', supabaseLib: lib });
  await assert.rejects(api.score('x'), (e) => e.message === MSG_OFFLINE && e.code === 'offline');
  const { lib: lib2 } = fakeLib({ rpcError: { message: 'TypeError: Failed to fetch' } });
  await assert.rejects(createApi({ url: 'u', key: 'k', supabaseLib: lib2 }).live(), (e) => e.message === MSG_OFFLINE);
});

test('api: llamadas RPC con los nombres y argumentos del servidor', async () => {
  const { lib, calls } = fakeLib({ rpcResult: null });
  const api = createApi({ url: 'u', key: 'k', supabaseLib: lib });
  await api.pin('calendario');
  await api.drop(30);
  await api.dropOff();
  await api.addPlayer('Ana');
  await api.removePlayer('id1');
  await api.score('id1');
  await api.undo();
  await api.resetCompetition();
  await api.auto();
  assert.deepEqual(calls, [
    ['tv_pin', { p_screen: 'calendario' }], ['tv_drop', { p_percent: 30 }], ['tv_drop_off', {}],
    ['tv_player_add', { p_name: 'Ana' }], ['tv_player_remove', { p_id: 'id1' }], ['tv_score', { p_id: 'id1' }],
    ['tv_undo', {}], ['tv_competition_reset', {}], ['tv_auto', {}],
  ]);
});

test('api: live() normaliza y auth usa shouldCreateUser false', async () => {
  const { lib, calls } = fakeLib({ rpcResult: { state: { mode: 'pin', pin_screen: 'calendario' }, players: [] } });
  const api = createApi({ url: 'u', key: 'k', supabaseLib: lib });
  assert.equal((await api.live()).state.pin_screen, 'calendario');
  await api.signInEmail('a@b.c');
  await api.verifyCode('a@b.c', '123456');
  assert.deepEqual(calls.slice(1), [
    ['otp', { email: 'a@b.c', options: { shouldCreateUser: false } }],
    ['verify', { email: 'a@b.c', token: '123456', type: 'email' }],
  ]);
});
