import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, calendarScreen, courseScreen, summaryScreen, emptyScreen } from '../js/render.js';

const course = (over = {}) => ({
  slug: 'delega-con-ia', name: 'Delega con IA', startDate: '2026-10-15', endDate: '2026-10-15',
  city: null, location: null, totalSeats: 60, availableSeats: 50, finished: false, ...over,
});
const TODAY = '2026-10-10';

test('esc escapa HTML', () => {
  assert.equal(esc('<b>"a" & \'b\'</b>'), '&lt;b&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/b&gt;');
  assert.equal(esc(null), '');
});

test('courseScreen muestra miniatura, fecha larga, días y cupos', () => {
  const h = courseScreen(course(), TODAY);
  assert.match(h, /assets\/cursos\/delega-con-ia\.jpg/);
  assert.match(h, /jueves 15 de octubre/);
  assert.match(h, /data-count="5"/);
  assert.match(h, /data-count="50"/);
  assert.doesNotMatch(h, /AGOTADO/);
});

test('courseScreen: pocos cupos pulsa en borgoña, agotado muestra etiqueta', () => {
  assert.match(courseScreen(course({ availableSeats: 4 }), TODAY), /kpi warn pulse/);
  assert.match(courseScreen(course({ availableSeats: 0 }), TODAY), /AGOTADO/);
});

test('courseScreen: cinta HOY / MAÑANA y finalizado', () => {
  assert.match(courseScreen(course({ startDate: '2026-10-10', endDate: '2026-10-10' }), TODAY), /HOY/);
  assert.match(courseScreen(course({ startDate: '2026-10-11', endDate: '2026-10-11' }), TODAY), /MAÑANA/);
  const done = courseScreen(course({ startDate: '2026-10-01', endDate: '2026-10-01', finished: true }), TODAY);
  assert.match(done, /FINALIZADO/);
  assert.doesNotMatch(done, /class="kpis"/);
});

test('courseScreen escapa el nombre', () => {
  assert.match(courseScreen(course({ name: '<i>x</i>' }), TODAY), /&lt;i&gt;x&lt;\/i&gt;/);
});

test('calendarScreen dibuja el mes, marca días y lista cursos próximos', () => {
  const h = calendarScreen([course(), course({ slug: 'old', name: 'Viejo', finished: true, startDate: '2026-10-01', endDate: '2026-10-01' })], TODAY);
  assert.match(h, /octubre 2026/);
  assert.match(h, /cell marked/);
  assert.match(h, /cell today/);
  assert.match(h, /Delega con IA/);
  assert.doesNotMatch(h, /Viejo/);
});

test('summaryScreen lista todos los cursos y marca finalizados', () => {
  const h = summaryScreen([course(), course({ slug: 'o', name: 'Viejo', finished: true, startDate: '2026-10-01', endDate: '2026-10-01' })], TODAY);
  assert.match(h, /Delega con IA/);
  assert.match(h, /tr done/);
});

test('emptyScreen', () => {
  assert.match(emptyScreen('Próximamente'), /Próximamente/);
  assert.match(emptyScreen('x'), /screen vacio/);
});
