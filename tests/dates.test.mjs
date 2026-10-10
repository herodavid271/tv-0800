import test from 'node:test';
import assert from 'node:assert/strict';
import { localISO, parseISO, daysBetween, addDaysISO, formatLong, formatShort } from '../js/dates.js';

test('localISO usa los componentes locales', () => {
  assert.equal(localISO(new Date(2026, 9, 5, 23, 59)), '2026-10-05');
});

test('parseISO separa año, mes y día', () => {
  assert.deepEqual(parseISO('2026-10-05'), { y: 2026, m: 10, d: 5 });
});

test('daysBetween cuenta días con signo y cruza meses', () => {
  assert.equal(daysBetween('2026-10-10', '2026-10-15'), 5);
  assert.equal(daysBetween('2026-10-15', '2026-10-10'), -5);
  assert.equal(daysBetween('2026-10-30', '2026-11-02'), 3);
  assert.equal(daysBetween('2026-10-10', '2026-10-10'), 0);
});

test('addDaysISO suma días cruzando mes', () => {
  assert.equal(addDaysISO('2026-10-30', 3), '2026-11-02');
  assert.equal(addDaysISO('2026-10-10', 0), '2026-10-10');
});

test('formatLong escribe día de la semana, día y mes', () => {
  assert.equal(formatLong('2026-10-15'), 'jueves 15 de octubre');
});

test('formatShort abrevia el mes a 3 letras', () => {
  assert.equal(formatShort('2026-10-05'), '5 oct');
});
