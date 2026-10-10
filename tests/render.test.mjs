import test from 'node:test';
import assert from 'node:assert/strict';
import {
  esc, flap, calendarScreen, courseScreen, dropoffScreen, announcementScreen, emptyScreen,
} from '../js/render.js';
import { buildPriceRows, formatPrice } from '../js/pricing.js';
import { DEFAULT_CONFIG } from '../js/data.js';

const course = (over = {}) => ({
  slug: 'delega-con-ia', name: 'Delega con IA', startDate: '2026-10-15', endDate: '2026-10-15',
  city: null, location: null, totalSeats: 60, availableSeats: 50, basePrice: 99.99, finished: false, ...over,
});
const TODAY = '2026-10-10';
// Texto visible: sin etiquetas, para comparar fichas (<i>H</i><i>O</i>...) como palabra.
const text = (h) => h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
const count = (h, re) => (h.match(re) ?? []).length;

test('esc escapa HTML', () => {
  assert.equal(esc('<b>"a" & \'b\'</b>'), '&lt;b&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/b&gt;');
  assert.equal(esc(null), '');
});

test('flap: una ficha por carácter, espacios y escape', () => {
  const h = flap('09:13');
  assert.match(h, /^<span class="fl">/);
  assert.equal(count(h, /<i[ >]/g), 5);
  assert.equal(text(h), '09:13');
  assert.match(flap('a b'), /<i class="sp"[^>]*>&nbsp;<\/i>/);
  assert.match(flap('5', 'k y'), /class="fl k y"/);
  assert.doesNotMatch(flap('<b>'), /<b>/);
  assert.match(flap('<'), /&lt;/);
});

test('calendarScreen: mes, un sticker por día marcado, aro en hoy', () => {
  const cs = [
    course({ startDate: '2026-10-15', endDate: '2026-10-16' }),
    course({ slug: 'b', name: 'B', startDate: '2026-10-22', endDate: '2026-10-22' }),
  ];
  const h = calendarScreen(cs, TODAY);
  assert.match(h, /class="screen c"/);
  assert.match(h, /Octubre/);
  assert.match(h, /2026/);
  assert.equal(count(h, /class="on[ "]/g), 3);
  assert.match(h, /--r:-9deg/);
  assert.match(h, /--r:7deg/);
  assert.match(h, /--r:-5deg/);
  assert.match(h, /class="hoy"/);
  assert.equal(count(h, /class="hoy"/g), 1);
});

test('calendarScreen: lista "Lo que viene" con máximo 3 y etiquetas de días', () => {
  const cs = [
    course({ slug: 'a', name: 'Uno', startDate: '2026-10-10', endDate: '2026-10-10' }),
    course({ slug: 'b', name: 'Dos', startDate: '2026-10-15', endDate: '2026-10-15' }),
    course({ slug: 'c', name: 'Tres', startDate: '2026-10-22', endDate: '2026-10-22' }),
    course({ slug: 'd', name: 'Cuatro', startDate: '2026-10-29', endDate: '2026-10-29' }),
    course({ slug: 'old', name: 'Viejo', startDate: '2026-10-01', endDate: '2026-10-01', finished: true }),
  ];
  const h = calendarScreen(cs, TODAY);
  assert.match(h, /Lo que viene/);
  assert.equal(count(h, /class="card it/g), 3);
  assert.match(h, /Uno/);
  assert.match(h, /Hoy/);
  assert.match(h, /Faltan 5 días/);
  assert.match(h, /Jueves 15 de octubre/);
  assert.match(h, /Tres/);
  assert.doesNotMatch(h, /Cuatro/);
  assert.doesNotMatch(h, /Viejo/);
  assert.match(h, /assets\/cursos\/b\.jpg/);
  assert.match(h, /nothumb/);
});

test('calendarScreen escapa el nombre', () => {
  assert.match(calendarScreen([course({ name: '<i>x</i>' })], TODAY), /&lt;i&gt;x&lt;\/i&gt;/);
});

test('courseScreen: miniatura, cupos, fecha de talón y cuenta en fichas', () => {
  const h = courseScreen(course(), TODAY);
  assert.match(h, /class="screen b[ "]/);
  assert.match(h, /assets\/cursos\/delega-con-ia\.jpg/);
  assert.match(h, /nothumb/);
  assert.match(h, /50 de 60/);
  assert.doesNotMatch(h, /AGOTADO/);
  assert.match(text(h), /Jueves15 de oct/);
  assert.match(h, /<span class="fl k[^"]*">(<i[^>]*>[^<]*<\/i>)+<\/span>/);
  assert.match(text(h), /05días/);
  assert.match(h, /data-clock/);
  assert.match(h, /En vivo desde 0800 Hub/);
});

test('courseScreen: AGOTADO, sin datos de cupos y mensaje propio', () => {
  assert.match(courseScreen(course({ availableSeats: 0 }), TODAY), /AGOTADO/);
  const nulls = courseScreen(course({ availableSeats: null, totalSeats: null }), TODAY);
  assert.doesNotMatch(nulls, /Cupos disponibles/);
  assert.doesNotMatch(nulls, /AGOTADO/);
  const msg = courseScreen(course(), TODAY, { message: 'Hoy cerramos <temprano>' });
  assert.match(msg, /Hoy cerramos &lt;temprano&gt;/);
  assert.doesNotMatch(msg, /En vivo desde 0800 Hub/);
});

test('courseScreen: HOY, MAÑANA y EN CURSO reemplazan la cuenta y no dicen "días"', () => {
  const hoy = courseScreen(course({ startDate: '2026-10-10', endDate: '2026-10-10' }), TODAY);
  assert.match(text(hoy), /HOY/);
  assert.doesNotMatch(text(hoy), /días/);
  const man = courseScreen(course({ startDate: '2026-10-11', endDate: '2026-10-11' }), TODAY);
  assert.match(text(man), /MAÑANA/);
  assert.doesNotMatch(text(man), /días/);
  const cur = courseScreen(course({ startDate: '2026-10-08', endDate: '2026-10-12' }), TODAY);
  assert.match(text(cur), /EN CURSO/);
  assert.doesNotMatch(text(cur), /días/);
});

test('courseScreen escapa el nombre', () => {
  assert.match(courseScreen(course({ name: '<i>x</i>' }), TODAY), /&lt;i&gt;x&lt;\/i&gt;/);
});

test('dropoffScreen: precio tachado, final y −30%', () => {
  const cs = [course(), course({ slug: 'b', name: 'Otro <b>', basePrice: 59.99 })];
  const h = dropoffScreen(cs, 30, TODAY);
  assert.match(h, /class="screen b[ "]/);
  for (const r of buildPriceRows(cs, 30)) {
    assert.ok(h.includes(`<s>${formatPrice(r.before)}</s>`));
    assert.ok(h.includes(`<b>${formatPrice(r.after)}</b>`));
  }
  assert.match(h, /−30%/);
  assert.match(h, /Descuento aplicado/);
  assert.match(h, /0800 1010 2026/);
  assert.match(h, /Otro &lt;b&gt;/);
  assert.equal(count(h, /<li>/g), 2);
});

test('dropoffScreen: máximo 8 filas y omite cursos sin precio', () => {
  const many = Array.from({ length: 10 }, (_, i) => course({ slug: `c${i}`, name: `C${i}` }));
  many.push(course({ slug: 'sin', name: 'SinPrecio', basePrice: null }));
  const h = dropoffScreen(many, 30, TODAY);
  assert.equal(count(h, /<li>/g), 8);
  assert.doesNotMatch(h, /SinPrecio/);
});

test('announcementScreen con fecha y nota', () => {
  const cfg = { ...DEFAULT_CONFIG, announcement_title: 'Delega <con> IA arranca', announcement_note: 'Quedan 50 cupos', announcement_date: '2026-10-15' };
  const h = announcementScreen(cfg, TODAY);
  assert.match(h, /class="screen b[ "]/);
  assert.match(h, /Delega &lt;con&gt; IA arranca/);
  assert.match(h, /Quedan 50 cupos/);
  assert.match(h, /class="talon"/);
  assert.match(h, />15</);
  assert.match(h, /octubre/);
  assert.match(h, /0800 1510 2026/);
});

test('announcementScreen sin fecha ni nota: sin talón, sin código', () => {
  const h = announcementScreen({ ...DEFAULT_CONFIG, announcement_title: 'Hola' }, TODAY);
  assert.match(h, /Hola/);
  assert.doesNotMatch(h, /class="talon"/);
  assert.doesNotMatch(h, /class="cod"/);
  assert.doesNotMatch(h, /<p>/);
  assert.match(h, /solo/);
});

test('announcementScreen: título largo baja de tamaño', () => {
  const largo = 'x'.repeat(70);
  assert.match(announcementScreen({ ...DEFAULT_CONFIG, announcement_title: largo }, TODAY), /class="[^"]*largo/);
  assert.doesNotMatch(announcementScreen({ ...DEFAULT_CONFIG, announcement_title: 'corto' }, TODAY), /largo/);
});

test('emptyScreen: logo blanco y texto escapado', () => {
  const h = emptyScreen('Próximamente');
  assert.match(h, /Próximamente/);
  assert.match(h, /class="screen b/);
  assert.match(h, /assets\/logo-0800-blanco\.png/);
  assert.match(emptyScreen('<x>'), /&lt;x&gt;/);
});
