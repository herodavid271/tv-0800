import test from 'node:test';
import assert from 'node:assert/strict';
import {
  esc, flap, calendarScreen, courseScreen, dropoffScreen, announcementScreen, emptyScreen, leaderboardScreen,
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
    assert.ok(h.includes(`<b><span class="nv">${formatPrice(r.after)}</span></b>`));
  }
  assert.match(h, /−30%/);
  assert.match(h, /Descuento aplicado/);
  assert.match(h, /0800 1010 2026/);
  assert.match(h, /Otro &lt;b&gt;/);
  assert.equal(count(h, /<li /g), 2);
});

test('dropoffScreen: máximo 8 filas y omite cursos sin precio', () => {
  const many = Array.from({ length: 10 }, (_, i) => course({ slug: `c${i}`, name: `C${i}` }));
  many.push(course({ slug: 'sin', name: 'SinPrecio', basePrice: null }));
  const h = dropoffScreen(many, 30, TODAY);
  assert.equal(count(h, /<li /g), 8);
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

test('announcementScreen: título muy largo usa el nivel xl', () => {
  const xl = announcementScreen({ ...DEFAULT_CONFIG, announcement_title: 'x'.repeat(120) }, TODAY);
  assert.match(xl, /class="d xl"/);
  assert.doesNotMatch(xl, /largo/);
  assert.match(announcementScreen({ ...DEFAULT_CONFIG, announcement_title: 'x'.repeat(100) }, TODAY), /class="d largo"/);
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
  assert.match(h, /assets\/logo-badge-blanco\.png/);
  assert.match(emptyScreen('<x>'), /&lt;x&gt;/);
});

const lbModel = (over = {}) => ({
  title: 'Delega con IA',
  leader: { name: 'Ana M.', points: 7 },
  others: [
    { rank: 2, name: 'Carlos R.', points: 6, isRecent: false },
    { rank: 3, name: 'Luisa P.', points: 1, isRecent: false },
  ],
  more: 0, recent: null, ...over,
});

test('leaderboardScreen: líder, filas y título', () => {
  const h = leaderboardScreen(lbModel());
  assert.match(h, /class="screen b competencia"/);
  assert.match(h, /assets\/logo-badge-negro\.png/);
  assert.match(h, /Competencia · Delega con IA/);
  assert.match(h, /<b class="d">Ana M\.<\/b><span>7 puntos<\/span>/);
  assert.match(h, /Los que vienen detrás/);
  assert.equal((h.match(/class="fila/g) || []).length, 2);
  assert.match(h, /<span class="nom">Carlos R\.<\/span>/);
  assert.match(leaderboardScreen(lbModel({ title: null })), /<p class="curso">Competencia<\/p>/);
});

test('leaderboardScreen: escapa nombres y título', () => {
  const h = leaderboardScreen(lbModel({
    title: '<i>t</i>', leader: { name: '<b>x</b>', points: 2 },
    others: [{ rank: 2, name: '"><img>', points: 1, isRecent: false }],
    recent: { name: '<s>' },
  }));
  assert.doesNotMatch(h, /<i>t|<b>x|<img>|<s>/);
  assert.match(h, /&lt;b&gt;x&lt;\/b&gt;/);
});

test('leaderboardScreen: punto singular y plural', () => {
  assert.match(leaderboardScreen(lbModel({ leader: { name: 'A', points: 1 } })), /1 punto</);
  assert.match(leaderboardScreen(lbModel({ leader: { name: 'A', points: 0 } })), /0 puntos</);
});

test('leaderboardScreen: +N más solo si hay más', () => {
  assert.match(leaderboardScreen(lbModel({ more: 5 })), /\+5 más/);
  assert.doesNotMatch(leaderboardScreen(lbModel()), /más/);
});

test('leaderboardScreen: cinta y fila nuevo solo con reciente', () => {
  const none = leaderboardScreen(lbModel());
  assert.doesNotMatch(none, /cinta|nuevo|acaba de sumar/);
  const h = leaderboardScreen(lbModel({
    others: [{ rank: 2, name: 'Carlos R.', points: 6, isRecent: true }, { rank: 3, name: 'L', points: 1, isRecent: false }],
    recent: { name: 'Carlos R.' },
  }));
  assert.match(h, /Carlos R\. acaba de sumar un punto/);
  assert.equal((h.match(/fila nuevo/g) || []).length, 1);
});

test('leaderboardScreen: vacío', () => {
  const h = leaderboardScreen({ title: null, leader: null, others: [], more: 0, recent: null });
  assert.match(h, /Aún no hay participantes/);
  assert.match(h, /class="screen b competencia vacio"/);
  assert.doesNotMatch(h, /panel/);
});

test('leaderboardScreen: nombre largo del líder baja de tamaño', () => {
  assert.doesNotMatch(leaderboardScreen(lbModel({ leader: { name: 'x'.repeat(10), points: 1 } })), /class="d (m|s)"/);
  assert.match(leaderboardScreen(lbModel({ leader: { name: 'x'.repeat(11), points: 1 } })), /<b class="d m">/);
  assert.match(leaderboardScreen(lbModel({ leader: { name: 'x'.repeat(17), points: 1 } })), /<b class="d s">/);
});

test('casheaScreen: precio de hoy, inicial y 40 %', async () => {
  const { casheaScreen } = await import('../js/render.js');
  const h = casheaScreen([course()], 30, 40, TODAY);
  assert.ok(h.includes('class="screen b dropoff entra cashea"'));
  assert.ok(h.includes('$69.99'));
  assert.ok(h.includes('$28.00'));
  assert.ok(h.includes('40%'));
  assert.ok(!h.includes('<s>$99.99'));
});

test('portadaScreen: cartelera (oscura) y boletín (papel), todos los cursos vigentes, logo del fondo correcto', async () => {
  const { portadaScreen } = await import('../js/render.js');
  const cs = [course({ slug: 'a', name: 'Alfa', startDate: '2026-10-22' }), course({ slug: 'b', name: 'Beta', startDate: '2026-10-15' }), course({ slug: 'z', name: 'Vieja', startDate: '2026-01-01', finished: true })];
  const car = portadaScreen(cs, 'cartelera', TODAY);
  assert.ok(car.includes('portada cartelera'));
  assert.ok(car.includes('logo-badge-blanco.png'));
  assert.equal((car.match(/class="tile"/g) || []).length, 2);
  assert.ok(car.indexOf('Beta') < car.indexOf('Alfa'));
  assert.ok(!car.includes('Vieja'));
  const bol = portadaScreen(cs, 'boletin', TODAY);
  assert.ok(bol.includes('portada boletin'));
  assert.ok(bol.includes('logo-badge-negro.png'));
  assert.equal((bol.match(/class="fila"/g) || []).length, 2);
});

test('odometer: una tira por dígito, de --a (partida) a --b (10 + destino)', async () => {
  const { odometer } = await import('../js/render.js');
  const h = odometer(30, 10);
  assert.equal(count(h, /class="od"/g), 2);
  assert.match(h, /--a:1;--b:13;--i:0/);
  assert.match(h, /--a:0;--b:10;--i:1/);
  assert.match(odometer(40), /--a:0;--b:14;--i:0/);
  assert.equal(count(odometer(5, 30), /class="od"/g), 1);
});

test('dropoffScreen: entra, sigue (con precio anterior) y quieto', () => {
  const cs = [course()];
  const entra = dropoffScreen(cs, 10, TODAY);
  assert.match(entra, /class="screen b dropoff entra"/);
  assert.match(entra, /class="confeti"/);
  assert.doesNotMatch(entra, /class="vj"/);
  const sigue = dropoffScreen(cs, 30, TODAY, { prev: { type: 'dropoff', percent: 10 } });
  assert.match(sigue, /class="screen b dropoff sigue"/);
  assert.ok(sigue.includes('<span class="vj">$89.99</span><span class="nv">$69.99</span>'));
  assert.match(sigue, /--a:1;--b:13/);
  const quieto = dropoffScreen(cs, 30, TODAY, { prev: { type: 'dropoff', percent: 30 } });
  assert.match(quieto, /class="screen b dropoff quieto"/);
  assert.doesNotMatch(quieto, /class="confeti"|class="vj"/);
  assert.match(dropoffScreen(cs, 30, TODAY, { prev: { type: 'cashea' } }), /dropoff sigue"/);
});

test('casheaScreen: sigue tras un drop y quieto si se repinta', async () => {
  const { casheaScreen } = await import('../js/render.js');
  assert.match(casheaScreen([course()], 30, 40, TODAY), /dropoff entra cashea"/);
  assert.match(casheaScreen([course()], 30, 40, TODAY, { prev: { type: 'dropoff', percent: 30 } }), /dropoff sigue cashea"/);
  assert.match(casheaScreen([course()], 30, 40, TODAY, { prev: { type: 'cashea' } }), /dropoff quieto cashea"/);
});
