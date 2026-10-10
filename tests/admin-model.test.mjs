import test from 'node:test';
import assert from 'node:assert/strict';
import {
  screenButtons, describeNow, playerRows, mainButtons, cierreIndex, CIERRE_STEPS, genderOf, funnyEmoji, withEmoji, NAME_MAX,
} from '../admin/js/model.js';
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

test('screenButtons: calendario y un curso próximo cada uno (sin competencia)', () => {
  const b = screenButtons(COURSES, live());
  assert.deepEqual(b.map((x) => x.id), ['calendario', 'curso:a', 'curso:b', 'curso:c']);
  assert.equal(b[1].label, 'Delega con IA');
  assert.equal(b[1].sub, '15 oct');
  assert.ok(b.every((x) => x.active === false));
  assert.deepEqual(screenButtons(COURSES, live({ mode: 'pin', pin_screen: 'curso:b' })).filter((x) => x.active).map((x) => x.id), ['curso:b']);
});

test('mainButtons: breaks, competencia en vivo y secuencia de cierre', () => {
  const ids = (l) => mainButtons(l).filter((x) => x.active).map((x) => x.label);
  assert.deepEqual(mainButtons(live()).map((x) => x.label), ['Secuencia de breaks', 'Competencia en vivo', 'Secuencia de cierre']);
  assert.deepEqual(ids(live()), []);
  assert.deepEqual(ids(live({ mode: 'pin', pin_screen: 'breaks' })), ['Secuencia de breaks']);
  assert.deepEqual(ids(live({ mode: 'pin', pin_screen: 'competencia' })), ['Competencia en vivo']);
  for (const p of ['cierre:10', 'cierre:30', 'cierre:cashea']) assert.deepEqual(ids(live({ mode: 'pin', pin_screen: p })), ['Secuencia de cierre']);
});

test('cierreIndex: 10 %, 30 % y Cashea en orden', () => {
  assert.deepEqual(CIERRE_STEPS.map((x) => x.id), ['cierre:10', 'cierre:30', 'cierre:cashea']);
  assert.equal(cierreIndex(live()), -1);
  assert.equal(cierreIndex(live({ mode: 'pin', pin_screen: 'cierre:10' })), 0);
  assert.equal(cierreIndex(live({ mode: 'pin', pin_screen: 'cierre:cashea' })), 2);
  assert.equal(cierreIndex(live({ mode: 'pin', pin_screen: 'calendario' })), -1);
});

test('describeNow: automático, breaks, competencia, cierre y cursos', () => {
  assert.equal(describeNow(live(), COURSES), 'Automático');
  assert.equal(describeNow(live({ mode: 'pin', pin_screen: 'breaks' }), COURSES), 'Secuencia de breaks');
  assert.equal(describeNow(live({ mode: 'pin', pin_screen: 'competencia' }), COURSES), 'Competencia en vivo');
  assert.equal(describeNow(live({ mode: 'pin', pin_screen: 'cierre:30' }), COURSES), 'Cierre: Drop −30 %');
  assert.equal(describeNow(live({ mode: 'pin', pin_screen: 'cierre:cashea' }), COURSES), 'Cierre: Inicial 40 % con Cashea');
  assert.equal(describeNow(live({ mode: 'pin', pin_screen: 'curso:a' }), COURSES), 'Delega con IA (fijo)');
});

test('genderOf: nombres en español', () => {
  for (const n of ['Ana', 'María José', 'Valentina', 'Carmen', 'Isabel', 'Raquel', 'Inés', 'Belén', 'Ruth']) assert.equal(genderOf(n), 'f', n);
  for (const n of ['Carlos', 'Luis', 'David', 'Juan', 'Miguel', 'Pedro', 'Luca', 'Joshua', 'Borja', 'Andrés']) assert.equal(genderOf(n), 'm', n);
  for (const n of ['', 'x', 'Dani', 'Jaime']) assert.equal(genderOf(n), 'x', n);
});

test('funnyEmoji: pools por género y emoji de un solo carácter', () => {
  const lo = () => 0; const hi = () => 0.999999;
  assert.notEqual(funnyEmoji('Ana', lo), funnyEmoji('Carlos', lo));
  for (const n of ['Ana', 'Carlos', 'Jaime']) {
    for (const r of [lo, hi]) assert.equal([...funnyEmoji(n, r)].length, 1);
  }
  assert.equal(withEmoji('Ana', lo), `${funnyEmoji('Ana', lo)} Ana`);
  assert.ok(NAME_MAX + 2 <= 24);
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
const memStore = (init = {}) => {
  const m = { ...init };
  return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, m };
};
const TOKEN = 'a'.repeat(64);

function fakeLib({ rpcResult, rpcError, rpcThrow } = {}) {
  const calls = [];
  const lib = {
    createClient: () => ({
      rpc: async (name, args) => {
        calls.push([name, args]);
        if (rpcThrow) throw rpcThrow;
        return { data: rpcResult ?? null, error: rpcError ?? null };
      },
    }),
  };
  return { lib, calls };
}
const mk = (lib, store = memStore({ 'tv0800.admin': TOKEN })) => createApi({ url: 'u', key: 'k', supabaseLib: lib, storage: store });

test('api: forbidden se mapea al mensaje en español', async () => {
  const { lib } = fakeLib({ rpcError: { message: 'forbidden' } });
  await assert.rejects(mk(lib).auto(), (e) => e.message === MSG_FORBIDDEN && e.code === 'forbidden');
  assert.equal(MSG_FORBIDDEN, 'Tu sesión terminó, entra de nuevo');
});

test('api: fallo de red se mapea a "Sin conexión, reintenta"', async () => {
  const { lib } = fakeLib({ rpcThrow: new TypeError('Failed to fetch') });
  await assert.rejects(mk(lib).score('x'), (e) => e.message === MSG_OFFLINE && e.code === 'offline');
  const { lib: lib2 } = fakeLib({ rpcError: { message: 'TypeError: Failed to fetch' } });
  await assert.rejects(mk(lib2).live(), (e) => e.message === MSG_OFFLINE);
});

test('api: las escrituras llevan el token y las lecturas no', async () => {
  const { lib, calls } = fakeLib({ rpcResult: null });
  const api = mk(lib);
  await api.pin('calendario');
  await api.addPlayer('Ana');
  await api.removePlayer('id1');
  await api.score('id1');
  await api.undo();
  await api.resetCompetition();
  await api.auto();
  await api.live();
  await api.editions();
  const t = { p_token: TOKEN };
  assert.deepEqual(calls, [
    ['tv_pin', { ...t, p_screen: 'calendario' }],
    ['tv_player_add', { ...t, p_name: 'Ana' }], ['tv_player_remove', { ...t, p_id: 'id1' }], ['tv_score', { ...t, p_id: 'id1' }],
    ['tv_undo', t], ['tv_competition_reset', t], ['tv_auto', t], ['tv_live', {}], ['tv_ediciones', {}],
  ]);
});

test('api: live() normaliza', async () => {
  const { lib } = fakeLib({ rpcResult: { state: { mode: 'pin', pin_screen: 'calendario' }, players: [] } });
  assert.equal((await mk(lib).live()).state.pin_screen, 'calendario');
});

test('api: login guarda el token y avisa a onAuth', async () => {
  const { lib, calls } = fakeLib({ rpcResult: { token: TOKEN } });
  const store = memStore();
  const api = mk(lib, store);
  const seen = [];
  api.onAuth((s) => seen.push(s));
  await api.login('hola@davidsantana.net', 'clave');
  assert.deepEqual(calls[0], ['tv_login', { p_email: 'hola@davidsantana.net', p_password: 'clave' }]);
  assert.equal(store.m['tv0800.admin'], TOKEN);
  assert.deepEqual(seen, [{ token: TOKEN }]);
});

test('api: login incorrecto o bloqueado lanza el código y no guarda nada', async () => {
  const store = memStore();
  await assert.rejects(mk(fakeLib({ rpcResult: { error: 'invalid', retry_seconds: 0 } }).lib, store).login('a', 'b'), (e) => e.code === 'invalid');
  await assert.rejects(
    mk(fakeLib({ rpcResult: { error: 'locked', retry_seconds: 300 } }).lib, store).login('a', 'b'),
    (e) => e.code === 'locked' && e.retrySeconds === 300,
  );
  assert.equal(store.m['tv0800.admin'], undefined);
});

test('api: session() valida el token; si el servidor lo rechaza lo borra', async () => {
  const store = memStore({ 'tv0800.admin': TOKEN });
  assert.deepEqual(await mk(fakeLib({ rpcResult: true }).lib, store).session(), { token: TOKEN });
  assert.equal(await mk(fakeLib({ rpcResult: false }).lib, store).session(), null);
  assert.equal(store.m['tv0800.admin'], undefined);
  assert.equal(await mk(fakeLib({ rpcResult: true }).lib, memStore()).session(), null);
});

test('api: sin red, session() conserva el token', async () => {
  const store = memStore({ 'tv0800.admin': TOKEN });
  const api = mk(fakeLib({ rpcThrow: new TypeError('Failed to fetch') }).lib, store);
  assert.deepEqual(await api.session(), { token: TOKEN });
  assert.equal(store.m['tv0800.admin'], TOKEN);
});

test('api: signOut borra el token local y avisa al servidor', async () => {
  const { lib, calls } = fakeLib({ rpcResult: null });
  const store = memStore({ 'tv0800.admin': TOKEN });
  await mk(lib, store).signOut();
  assert.equal(store.m['tv0800.admin'], undefined);
  assert.deepEqual(calls, [['tv_logout', { p_token: TOKEN }]]);
});
