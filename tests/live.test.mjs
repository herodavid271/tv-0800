import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LIVE, normalizeLive, resolveScreen, buildLeaderboard, liveSignature } from '../js/live.js';
import { DEFAULT_CONFIG } from '../js/data.js';

const course = (slug, startDate, over = {}) => ({
  slug, name: `Curso ${slug}`, startDate, endDate: startDate, city: null, location: null,
  totalSeats: 60, availableSeats: 30, basePrice: 100, finished: false, ...over,
});
const raw = (state = {}, players = [], server_time = '2026-10-10T18:00:10+00:00') => ({
  server_time, state: { mode: 'auto', pin_screen: null, drop_active: false, drop_percent: 0, drop_at: null, ...state }, players,
});
const P = (id, points, last, name = id) => ({ id, name, points, last_scored_at: last });
const TODAY = '2026-10-10';
const cfg = (over = {}) => ({ ...DEFAULT_CONFIG, ...over });

test('normalizeLive: basura devuelve el valor por defecto', () => {
  for (const bad of [null, undefined, 5, 'x', []]) assert.deepEqual(normalizeLive(bad), DEFAULT_LIVE);
});

test('normalizeLive: modo pin solo con pin_screen string no vacío', () => {
  assert.equal(normalizeLive(raw({ mode: 'pin', pin_screen: 'calendario' })).state.mode, 'pin');
  assert.equal(normalizeLive(raw({ mode: 'pin', pin_screen: '' })).state.mode, 'auto');
  assert.equal(normalizeLive(raw({ mode: 'pin', pin_screen: 7 })).state.mode, 'auto');
  assert.equal(normalizeLive(raw({ mode: 'pin', pin_screen: null })).state.mode, 'auto');
});

test('normalizeLive: drop_percent entero 0 a 90 y drop_active estricto', () => {
  assert.equal(normalizeLive(raw({ drop_percent: 25 })).state.drop_percent, 25);
  assert.equal(normalizeLive(raw({ drop_percent: 90 })).state.drop_percent, 90);
  for (const v of [91, -1, 2.5, '20', null]) assert.equal(normalizeLive(raw({ drop_percent: v })).state.drop_percent, 0);
  assert.equal(normalizeLive(raw({ drop_active: true })).state.drop_active, true);
  assert.equal(normalizeLive(raw({ drop_active: 'true' })).state.drop_active, false);
  assert.equal(normalizeLive(raw({ drop_active: 1 })).state.drop_active, false);
});

test('normalizeLive: jugadores conservan el orden y se sanean', () => {
  const live = normalizeLive(raw({}, [
    P('b', 3, '2026-10-10T17:00:00+00:00', 'x'.repeat(40)),
    P('a', 3, null, 'Ana'),
    { id: 'c', name: 'Zed', points: -4, last_scored_at: 5 },
    { id: 'd', name: 'Tom', points: 2.5 },
    null,
  ]));
  assert.deepEqual(live.players.map((p) => p.id), ['b', 'a', 'c', 'd']);
  assert.equal(live.players[0].name.length, 24);
  assert.equal(live.players[1].lastScoredAt, null);
  assert.equal(live.players[2].points, 0);
  assert.equal(live.players[2].lastScoredAt, null);
  assert.equal(live.players[3].points, 0);
  assert.equal(live.serverTime, '2026-10-10T18:00:10+00:00');
  assert.equal(normalizeLive({ ...raw(), server_time: 3 }).serverTime, null);
  assert.deepEqual(normalizeLive({ state: raw().state, players: 'x' }).players, []);
});

test('resolveScreen: automático devuelve null', () => {
  assert.equal(resolveScreen(normalizeLive(raw()), [course('a', '2026-10-15')], cfg(), TODAY), null);
  assert.equal(resolveScreen(DEFAULT_LIVE, [], cfg(), TODAY), null);
});

test('resolveScreen: DROP activo con curso con precio', () => {
  const live = normalizeLive(raw({ drop_active: true, drop_percent: 30, drop_at: 'T1' }));
  const r = resolveScreen(live, [course('a', '2026-10-15')], cfg(), TODAY);
  assert.deepEqual(r, { screen: { type: 'dropoff', percent: 30 }, locked: true, key: 'dropoff:30:T1' });
});

test('resolveScreen: DROP no aplica sin porcentaje válido ni cursos con precio', () => {
  const cs = [course('a', '2026-10-15')];
  assert.equal(resolveScreen(normalizeLive(raw({ drop_active: true, drop_percent: 0 })), cs, cfg(), TODAY), null);
  assert.equal(resolveScreen(normalizeLive(raw({ drop_active: true, drop_percent: 20 })), [], cfg(), TODAY), null);
  assert.equal(resolveScreen(normalizeLive(raw({ drop_active: true, drop_percent: 20 })), [course('a', '2026-10-15', { basePrice: null })], cfg(), TODAY), null);
});

test('resolveScreen: curso oculto no cuenta para el DROP', () => {
  const live = normalizeLive(raw({ drop_active: true, drop_percent: 20 }));
  assert.equal(resolveScreen(live, [course('a', '2026-10-15')], cfg({ hidden_courses: ['a'] }), TODAY), null);
});

test('resolveScreen: DROP tiene prioridad sobre pantalla fija', () => {
  const live = normalizeLive(raw({ mode: 'pin', pin_screen: 'calendario', drop_active: true, drop_percent: 10, drop_at: 'T2' }));
  const r = resolveScreen(live, [course('a', '2026-10-15')], cfg(), TODAY);
  assert.equal(r.screen.type, 'dropoff');
  assert.equal(r.key, 'dropoff:10:T2');
});

test('resolveScreen: pantallas fijas', () => {
  const cs = [course('a', '2026-10-15')];
  const pin = (p) => resolveScreen(normalizeLive(raw({ mode: 'pin', pin_screen: p })), cs, cfg(), TODAY);
  assert.deepEqual(pin('calendario'), { screen: { type: 'calendario' }, locked: true, key: 'pin:calendario' });
  assert.deepEqual(pin('competencia'), { screen: { type: 'competencia' }, locked: true, key: 'pin:competencia' });
  assert.deepEqual(pin('curso:a'), { screen: { type: 'curso', course: cs[0] }, locked: true, key: 'pin:curso:a' });
  assert.equal(pin('otra'), null);
});

test('resolveScreen: curso fijado inexistente, finalizado u oculto se ignora', () => {
  const cs = [course('a', '2026-10-15'), course('f', '2026-09-01', { finished: true })];
  const pin = (p, config = cfg()) => resolveScreen(normalizeLive(raw({ mode: 'pin', pin_screen: p })), cs, config, TODAY);
  assert.equal(pin('curso:zzz'), null);
  assert.equal(pin('curso:f'), null);
  assert.equal(pin('curso:a', cfg({ hidden_courses: ['a'] })), null);
});

test('buildLeaderboard: 0 jugadores', () => {
  const lb = buildLeaderboard(DEFAULT_LIVE, [], TODAY);
  assert.deepEqual(lb, { title: null, leader: null, others: [], more: 0, recent: null });
});

test('buildLeaderboard: líder, otros 2..7 y +N más', () => {
  const players = Array.from({ length: 10 }, (_, i) => P(`p${i}`, 10 - i, null, `J${i}`));
  const lb = buildLeaderboard(normalizeLive(raw({}, players)), [], TODAY);
  assert.deepEqual(lb.leader, { name: 'J0', points: 10 });
  assert.equal(lb.others.length, 6);
  assert.deepEqual(lb.others.map((o) => o.rank), [2, 3, 4, 5, 6, 7]);
  assert.equal(lb.others[0].name, 'J1');
  assert.equal(lb.more, 3);
  const exact = buildLeaderboard(normalizeLive(raw({}, players.slice(0, 7))), [], TODAY);
  assert.equal(exact.more, 0);
  assert.equal(exact.others.length, 6);
});

test('buildLeaderboard: empates conservan el orden recibido', () => {
  const lb = buildLeaderboard(normalizeLive(raw({}, [P('b', 5, null, 'B'), P('a', 5, null, 'A'), P('c', 5, null, 'C')])), [], TODAY);
  assert.equal(lb.leader.name, 'B');
  assert.deepEqual(lb.others.map((o) => o.name), ['A', 'C']);
});

test('buildLeaderboard: ventana de 10 s (9.999 s sí, 10 s no)', () => {
  const at = (ms) => normalizeLive(raw({}, [P('a', 5, '2026-10-10T18:00:00.000+00:00', 'A')], new Date(Date.parse('2026-10-10T18:00:00.000Z') + ms).toISOString()));
  assert.deepEqual(buildLeaderboard(at(9999), [], TODAY).recent, { name: 'A' });
  assert.equal(buildLeaderboard(at(10000), [], TODAY).recent, null);
  assert.equal(buildLeaderboard(normalizeLive(raw({}, [P('a', 5, null)])), [], TODAY).recent, null);
});

test('buildLeaderboard: reciente es el más reciente y marca isRecent', () => {
  const live = normalizeLive(raw({}, [
    P('a', 9, '2026-10-10T17:59:50+00:00', 'A'),
    P('b', 8, '2026-10-10T18:00:05+00:00', 'B'),
    P('c', 7, '2026-10-10T18:00:08+00:00', 'C'),
  ]));
  const lb = buildLeaderboard(live, [], TODAY);
  assert.deepEqual(lb.recent, { name: 'C' });
  assert.deepEqual(lb.others.map((o) => o.isRecent), [false, true]);
  const lb2 = buildLeaderboard(normalizeLive(raw({}, [P('a', 9, '2026-10-10T18:00:08+00:00', 'A'), P('b', 8, '2026-10-10T17:00:00+00:00', 'B')])), [], TODAY);
  assert.deepEqual(lb2.others.map((o) => o.isRecent), [false]);
  assert.deepEqual(lb2.recent, { name: 'A' });
});

test('buildLeaderboard: título es el curso de hoy', () => {
  const live = normalizeLive(raw({}, [P('a', 1, null)]));
  const cs = [
    course('p', '2026-09-01', { endDate: '2026-09-02' }),
    course('f', '2026-10-09', { endDate: '2026-10-11', finished: true }),
    course('hoy', '2026-10-09', { endDate: '2026-10-11' }),
    course('fut', '2026-10-20', { endDate: '2026-10-21' }),
  ];
  assert.equal(buildLeaderboard(live, cs, TODAY).title, 'Curso hoy');
  assert.equal(buildLeaderboard(live, [cs[0], cs[3]], TODAY).title, null);
});

test('liveSignature: estable con distinto serverTime, cambia con lo visible', () => {
  const ps = [P('a', 5, '2026-10-10T17:00:00+00:00', 'A'), P('b', 4, null, 'B')];
  const l1 = normalizeLive(raw({}, ps, '2026-10-10T18:00:10+00:00'));
  const l2 = normalizeLive(raw({}, ps, '2026-10-10T18:00:11+00:00'));
  assert.equal(liveSignature(l1, [], TODAY), liveSignature(l2, [], TODAY));
  const l3 = normalizeLive(raw({}, [P('a', 6, '2026-10-10T17:00:00+00:00', 'A'), ps[1]]));
  assert.notEqual(liveSignature(l1, [], TODAY), liveSignature(l3, [], TODAY));
  const l4 = normalizeLive(raw({ drop_active: true, drop_percent: 20, drop_at: 'T' }, ps));
  assert.notEqual(liveSignature(l1, [], TODAY), liveSignature(l4, [], TODAY));
  const fresh = normalizeLive(raw({}, [P('a', 5, '2026-10-10T18:00:05+00:00', 'A'), ps[1]], '2026-10-10T18:00:10+00:00'));
  const stale = normalizeLive(raw({}, [P('a', 5, '2026-10-10T18:00:05+00:00', 'A'), ps[1]], '2026-10-10T18:00:20+00:00'));
  assert.notEqual(liveSignature(fresh, [], TODAY), liveSignature(stale, [], TODAY));
});
