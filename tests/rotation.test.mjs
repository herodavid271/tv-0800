import test from 'node:test';
import assert from 'node:assert/strict';
import { daysUntil, badgeFor, seatState, buildScreens, LOW_SEATS } from '../js/rotation.js';
import { DEFAULT_CONFIG } from '../js/data.js';

const course = (slug, startDate, over = {}) => ({
  slug, name: slug, startDate, endDate: startDate, city: null, location: null,
  totalSeats: 60, availableSeats: 30, finished: false, ...over,
});

test('daysUntil cuenta días desde hoy', () => {
  assert.equal(daysUntil('2026-10-15', '2026-10-10'), 5);
  assert.equal(daysUntil('2026-10-09', '2026-10-10'), -1);
});

test('badgeFor', () => {
  assert.equal(badgeFor(-1), 'EN CURSO');
  assert.equal(badgeFor(0), 'HOY');
  assert.equal(badgeFor(1), 'MAÑANA');
  assert.equal(badgeFor(2), null);
});

test('seatState', () => {
  assert.equal(LOW_SEATS, 10);
  assert.equal(seatState({ availableSeats: 0 }), 'agotado');
  assert.equal(seatState({ availableSeats: 10 }), 'pocos');
  assert.equal(seatState({ availableSeats: 11 }), 'ok');
});

test('buildScreens: calendario, cursos por fecha y resumen', () => {
  const courses = [course('b', '2026-10-16'), course('c', '2026-10-22')];
  const s = buildScreens(courses, DEFAULT_CONFIG, '2026-10-10');
  assert.deepEqual(s.map((x) => x.type), ['calendario', 'curso', 'curso', 'resumen']);
  assert.deepEqual(s.filter((x) => x.type === 'curso').map((x) => x.course.slug), ['b', 'c']);
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
  assert.deepEqual(s.map((x) => x.type), ['calendario', 'curso', 'resumen']);
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
