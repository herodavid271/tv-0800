import test from 'node:test';
import assert from 'node:assert/strict';
import { monthToShow, buildMonthGrid } from '../js/calendar.js';

const course = (slug, startDate, endDate = startDate, finished = false) => ({
  slug, name: slug, startDate, endDate, city: null, location: null, totalSeats: 60, availableSeats: 30, finished,
});

test('monthToShow muestra el mes de hoy si hay fechas ahí', () => {
  assert.deepEqual(monthToShow('2026-10-10', [course('a', '2026-10-15')]), { year: 2026, month: 9 });
});

test('monthToShow salta al mes de la próxima fecha si el actual no tiene', () => {
  assert.deepEqual(monthToShow('2026-10-28', [course('a', '2026-11-05')]), { year: 2026, month: 10 });
});

test('monthToShow usa el mes de hoy si no hay cursos próximos', () => {
  assert.deepEqual(monthToShow('2026-10-10', [course('a', '2026-10-01', '2026-10-01', true)]), { year: 2026, month: 9 });
  assert.deepEqual(monthToShow('2026-10-10', []), { year: 2026, month: 9 });
});

test('buildMonthGrid: octubre 2026 empieza en jueves, semanas lunes a domingo', () => {
  const g = buildMonthGrid(2026, 9, [], '2026-10-10');
  assert.equal(g.title, 'octubre 2026');
  assert.deepEqual(g.weekdays, ['L', 'M', 'M', 'J', 'V', 'S', 'D']);
  assert.ok(g.weeks.every((w) => w.length === 7));
  const first = g.weeks[0];
  assert.deepEqual(first.slice(0, 3), [null, null, null]);
  assert.equal(first[3].day, 1);
  assert.equal(first[3].iso, '2026-10-01');
  assert.equal(g.weeks.flat().filter(Boolean).length, 31);
});

test('buildMonthGrid marca fechas de cursos próximos y el día de hoy', () => {
  const g = buildMonthGrid(2026, 9, [course('a', '2026-10-15'), course('b', '2026-10-15'), course('c', '2026-10-22')], '2026-10-10');
  const cells = g.weeks.flat().filter(Boolean);
  assert.deepEqual(cells.find((c) => c.day === 15).marked, ['a', 'b']);
  assert.deepEqual(cells.find((c) => c.day === 22).marked, ['c']);
  assert.deepEqual(cells.find((c) => c.day === 16).marked, []);
  assert.equal(cells.find((c) => c.day === 10).isToday, true);
  assert.equal(cells.find((c) => c.day === 11).isToday, false);
});

test('buildMonthGrid marca todos los días de una edición de varios días y no marca finalizadas', () => {
  const g = buildMonthGrid(2026, 9, [course('a', '2026-10-15', '2026-10-17'), course('z', '2026-10-05', '2026-10-05', true)], '2026-10-10');
  const cells = g.weeks.flat().filter(Boolean);
  assert.deepEqual([15, 16, 17].map((d) => cells.find((c) => c.day === d).marked.length), [1, 1, 1]);
  assert.equal(cells.find((c) => c.day === 5).marked.length, 0);
});

test('monthToShow usa el mes de hoy si una edición empezó el mes pasado y sigue en curso', () => {
  assert.deepEqual(monthToShow('2026-10-01', [course('a', '2026-09-30', '2026-10-02')]), { year: 2026, month: 9 });
});
