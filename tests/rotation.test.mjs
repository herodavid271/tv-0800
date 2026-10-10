import test from 'node:test';
import assert from 'node:assert/strict';
import { daysUntil, findScreenIndex, seatState, buildScreens, LOW_SEATS } from '../js/rotation.js';
import { DEFAULT_CONFIG } from '../js/data.js';

const course = (slug, startDate, over = {}) => ({
  slug, name: slug, startDate, endDate: startDate, city: null, location: null,
  totalSeats: 60, availableSeats: 30, finished: false, ...over,
});

test('daysUntil cuenta días desde hoy', () => {
  assert.equal(daysUntil('2026-10-15', '2026-10-10'), 5);
  assert.equal(daysUntil('2026-10-09', '2026-10-10'), -1);
});

test('seatState', () => {
  assert.equal(LOW_SEATS, 10);
  assert.equal(seatState({ availableSeats: 0 }), 'agotado');
  assert.equal(seatState({ availableSeats: 10 }), 'pocos');
  assert.equal(seatState({ availableSeats: 11 }), 'ok');
});

test('buildScreens: calendario y cursos por fecha, sin resumen', () => {
  const courses = [course('b', '2026-10-16'), course('c', '2026-10-22')];
  const s = buildScreens(courses, DEFAULT_CONFIG, '2026-10-10');
  assert.deepEqual(s.map((x) => x.type), ['calendario', 'curso', 'curso']);
  assert.deepEqual(s.filter((x) => x.type === 'curso').map((x) => x.course.slug), ['b', 'c']);
});

test('buildScreens: resumen y nombres desconocidos se ignoran', () => {
  const cfg = { ...DEFAULT_CONFIG, screens: ['resumen', 'calendario', 'xyz'] };
  const s = buildScreens([course('a', '2026-10-15')], cfg, '2026-10-10');
  assert.deepEqual(s.map((x) => x.type), ['calendario']);
});

const priced = (slug, d, over = {}) => course(slug, d, { basePrice: 100, ...over });
const dcfg = (over = {}) => ({ ...DEFAULT_CONFIG, discount_active: true, discount_percent: 20, ...over });

test('buildScreens: anuncio primero y dropoff último', () => {
  const cfg = dcfg({ announcement_title: 'Aviso' });
  const s = buildScreens([priced('a', '2026-10-15')], cfg, '2026-10-10');
  assert.deepEqual(s.map((x) => x.type), ['anuncio', 'calendario', 'curso', 'dropoff']);
  assert.equal(s[3].percent, 20);
});

test('buildScreens: dropoff requiere flag, porcentaje 1-90 y algún precio', () => {
  const c = [priced('a', '2026-10-15')];
  const types = (cfg, cs = c) => buildScreens(cs, cfg, '2026-10-10').map((x) => x.type);
  assert.ok(types(dcfg()).includes('dropoff'));
  assert.ok(!types(dcfg({ discount_active: false })).includes('dropoff'));
  assert.ok(!types(dcfg({ discount_active: 'true' })).includes('dropoff'));
  assert.ok(!types(dcfg({ discount_percent: 0 })).includes('dropoff'));
  assert.ok(!types(dcfg({ discount_percent: 91 })).includes('dropoff'));
  assert.ok(types(dcfg({ discount_percent: 90 })).includes('dropoff'));
  assert.ok(!types(dcfg(), [course('a', '2026-10-15')]).includes('dropoff'));
});

test('buildScreens: dropoff con solo cursos finalizados con precio', () => {
  const old = [priced('old', '2026-10-01', { finished: true })];
  assert.deepEqual(buildScreens(old, dcfg(), '2026-10-10'), [{ type: 'dropoff', percent: 20 }]);
});

test('buildScreens: anuncio sin cursos próximos', () => {
  const cfg = { ...DEFAULT_CONFIG, announcement_title: 'Aviso' };
  assert.deepEqual(buildScreens([], cfg, '2026-10-10'), [{ type: 'anuncio' }]);
});

test('buildScreens: cursos ocultos no cuentan para el dropoff', () => {
  const cfg = dcfg({ hidden_courses: ['a'] });
  assert.deepEqual(buildScreens([priced('a', '2026-10-15')], cfg, '2026-10-10'), [{ type: 'vacio' }]);
});

test('buildScreens: el curso de hoy o mañana pasa primero', () => {
  const courses = [course('late', '2026-10-22'), course('tomorrow', '2026-10-11')];
  const s = buildScreens(courses, DEFAULT_CONFIG, '2026-10-10');
  assert.deepEqual(s.filter((x) => x.type === 'curso').map((x) => x.course.slug), ['tomorrow', 'late']);
});

test('buildScreens: los cursos finalizados no tienen pantalla propia', () => {
  const courses = [course('old', '2026-10-01', { finished: true }), course('new', '2026-10-15')];
  const s = buildScreens(courses, DEFAULT_CONFIG, '2026-10-10');
  assert.deepEqual(s.filter((x) => x.type === 'curso').map((x) => x.course.slug), ['new']);
  assert.deepEqual(s.map((x) => x.type), ['calendario', 'curso']);
});

test('buildScreens respeta hidden_courses y screens de la config', () => {
  const courses = [course('a', '2026-10-15'), course('b', '2026-10-16')];
  const cfg = { ...DEFAULT_CONFIG, hidden_courses: ['a'], screens: ['cursos'] };
  const s = buildScreens(courses, cfg, '2026-10-10');
  assert.deepEqual(s.map((x) => x.type), ['curso']);
  assert.equal(s[0].course.slug, 'b');
});

test('buildScreens: sin cursos próximos devuelve una pantalla vacía', () => {
  assert.deepEqual(buildScreens([], DEFAULT_CONFIG, '2026-10-10'), [{ type: 'vacio' }]);
  const onlyOld = [course('old', '2026-10-01', { finished: true })];
  assert.deepEqual(buildScreens(onlyOld, DEFAULT_CONFIG, '2026-10-10'), [{ type: 'vacio' }]);
});

test('buildScreens: config sin pantallas válidas devuelve vacío', () => {
  const cfg = { ...DEFAULT_CONFIG, screens: ['otra'] };
  assert.deepEqual(buildScreens([course('a', '2026-10-15')], cfg, '2026-10-10'), [{ type: 'vacio' }]);
});

test('seatState: plazas nulas o ausentes no se leen como agotado', () => {
  assert.equal(seatState({ availableSeats: null }), 'ok');
  assert.equal(seatState({}), 'ok');
});

test('findScreenIndex: encuentra la misma pantalla tras insertar un anuncio al inicio', () => {
  const old = [{ type: 'calendario' }, { type: 'dropoff' }];
  const nuevo = [{ type: 'anuncio' }, { type: 'calendario' }, { type: 'dropoff' }];
  assert.equal(findScreenIndex(old, 1, nuevo), 2);
});

test('findScreenIndex: pantalla eliminada devuelve el ultimo indice', () => {
  const old = [{ type: 'calendario' }, { type: 'dropoff' }];
  assert.equal(findScreenIndex(old, 1, [{ type: 'calendario' }, { type: 'anuncio' }]), 1);
});

test('findScreenIndex: lista anterior vacia devuelve el ultimo indice', () => {
  assert.equal(findScreenIndex([], 0, [{ type: 'a' }, { type: 'b' }, { type: 'c' }]), 2);
});

test('findScreenIndex: los cursos se distinguen por slug', () => {
  const k = (slug) => ({ type: 'curso', course: { slug } });
  assert.equal(findScreenIndex([k('a'), k('b')], 1, [k('b'), k('a')]), 0);
});
