import { formatLong, parseISO, MESES } from './dates.js';
import { daysUntil, seatState } from './rotation.js';
import { monthToShow, buildMonthGrid } from './calendar.js';
import { buildPriceRows, formatPrice, buildCasheaRows } from './pricing.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const pad = (n) => String(n).padStart(2, '0');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// Logo: siempre en contraste con su fondo. Fondo oscuro = pastilla blanca con letras negras;
// fondo claro (papel, sticker amarillo, recibo blanco) = pastilla negra con letras blancas.
const LOGO_DARK = 'assets/logo-badge-blanco.png';
const LOGO_LIGHT = 'assets/logo-badge-negro.png';
const DEFAULT_MESSAGE = 'En vivo desde 0800 Hub';
const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

/** Fichas de tablero: una <i> por carácter; --i alimenta el escalonado. */
export function flap(text, cls = '') {
  const tiles = [...String(text ?? '')]
    .map((ch, i) => (ch === ' ' ? `<i class="sp" style="--i:${i}">&nbsp;</i>` : `<i style="--i:${i}">${esc(ch)}</i>`))
    .join('');
  return `<span class="${cls ? `fl ${esc(cls)}` : 'fl'}">${tiles}</span>`;
}

export const clockText = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const clock = () => flap(clockText(), 'reloj').replace('<span', '<span data-clock');

const barcode = (n, cls = 'cod') => `<div class="${cls}" aria-hidden="true">${'<i></i>'.repeat(n)}</div>`;
const ticketCode = (iso) => {
  const { y, m, d } = parseISO(iso);
  return `0800 ${pad(d)}${pad(m)} ${y}`;
};

const header = () => `<header class="top"><img src="${LOGO_DARK}" alt="0800">${clock()}</header>`;
const footer = (message, todayISO) =>
  `<footer class="pie"><span><i></i>${esc(message || DEFAULT_MESSAGE)}</span><span>${formatLong(todayISO)}</span></footer>`;

function daysLabel(days) {
  if (days < 0) return 'En curso';
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  return `Faltan ${days} días`;
}

const thumb = (slug) =>
  `<img src="assets/cursos/${esc(slug)}.jpg" alt="" onerror="this.parentNode.classList.add('nothumb')">`;

// ---------- Calendario (C · sticker) ----------
const RING = '<svg viewBox="0 0 120 100" aria-hidden="true"><path d="M60 8C95 6 114 28 112 52 110 80 84 94 56 92 26 90 6 72 9 46 12 22 38 10 70 12" fill="none" stroke="#A3243B" stroke-width="6" stroke-linecap="round"></path></svg>';
const CLOUD = '<path d="M60 125H240a35 35 0 0 0 0-70a45 45 0 0 0-80-20a50 50 0 0 0-75 25a38 38 0 0 0-25 65z"></path>';
const STICKER_ROT = ['-9deg', '7deg', '-5deg'];
const ITEM_ROT = ['1.2deg', '-1.4deg', '1deg'];

export function calendarScreen(courses, todayISO) {
  const { year, month } = monthToShow(todayISO, courses);
  const g = buildMonthGrid(year, month, courses, todayISO);
  let n = 0;
  const cells = g.weeks.flat().map((cell) => {
    if (!cell) return '<span class="e"></span>';
    const ring = cell.isToday ? RING : '';
    if (cell.marked.length) {
      const k = n++;
      return `<span class="on${cell.isToday ? ' hoy' : ''}"><b class="d" style="--r:${STICKER_ROT[k % 3]};--i:${k}">${cell.day}</b>${ring}</span>`;
    }
    return cell.isToday ? `<span class="hoy">${cell.day}${ring}</span>` : `<span>${cell.day}</span>`;
  });
  const items = courses
    .filter((c) => !c.finished)
    .slice(0, 3)
    .map(
      (c, i) => `<article class="card it" style="--r:${ITEM_ROT[i]};--i:${i}">${thumb(c.slug)}<div><small>${cap(formatLong(c.startDate))}</small><b class="d">${esc(c.name)}</b><em>${daysLabel(daysUntil(c.startDate, todayISO))}</em></div></article>`)
    .join('');
  return `<section class="screen c${g.weeks.length > 5 ? ' seis' : ''}">
<svg class="nube n1" viewBox="0 0 300 150" aria-hidden="true">${CLOUD}</svg>
<svg class="nube n2" viewBox="0 0 300 150" aria-hidden="true">${CLOUD}</svg>
<div class="etq"><img src="${LOGO_LIGHT}" alt="0800"></div>
<article class="hoja card">
<div class="anillas" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
<header><b class="d">${cap(MESES[month])}</b><span class="d">${year}</span></header>
<div class="wk">${WEEKDAYS.map((w) => `<span>${w}</span>`).join('')}</div>
<div class="dias">${cells.join('')}</div>
</article>
<section class="lista"><h1 class="titulo d"><span>Lo que viene</span></h1>${items}</section>
</section>`;
}

// ---------- Curso (B · tablero, tiquete blanco) ----------
function seatsBlock(c) {
  if (c.availableSeats == null) return '';
  const state = seatState(c);
  if (state === 'agotado') return '<p class="seats warn"><small>Cupos disponibles</small><b class="d">AGOTADO</b></p>';
  if (c.totalSeats == null) return '';
  return `<p class="seats${state === 'pocos' ? ' warn' : ''}"><small>Cupos disponibles</small><b class="d">${Number(c.availableSeats)} de ${Number(c.totalSeats)}</b></p>`;
}

function countdown(c, days) {
  if (c.finished) return '';
  if (days > 1) {
    const n = String(days).padStart(2, '0');
    return `<small>Faltan</small><div class="cd">${flap(n, n.length > 2 ? 'k n3' : 'k')}<b class="d">días</b></div>`;
  }
  const word = days < 0 ? 'EN CURSO' : days === 0 ? 'HOY' : 'MAÑANA';
  const size = word.length > 6 ? ' w8' : word.length > 3 ? ' w6' : '';
  return `<small>${days < 0 ? 'Estado' : 'Empieza'}</small><div class="cd">${flap(word, `k${size}`)}</div>`;
}

export function courseScreen(c, todayISO, opts = {}) {
  const days = daysUntil(c.startDate, todayISO);
  const { d, m } = parseISO(c.startDate);
  const weekday = cap(formatLong(c.startDate).split(' ')[0]);
  const place = [c.city, c.location].filter(Boolean).join(' · ');
  return `<section class="screen b curso" data-slug="${esc(c.slug)}">
${header()}
<article class="ticket">
<div class="izq">
<div class="pic">${thumb(c.slug)}<span class="fb d">${esc(c.name)}</span></div>
<div class="meta">
<p class="nom"><small>Curso presencial${place ? ` · ${esc(place)}` : ''}</small><b class="d${(c.name ?? '').length > 22 ? ' largo' : ''}">${esc(c.name)}</b></p>
${seatsBlock(c)}
</div>
</div>
<div class="der">
<small>Fecha</small>
<p class="f d">${weekday}<br>${d} de ${MESES[m - 1].slice(0, 3)}</p>
${countdown(c, days)}
${barcode(40)}
<code>${ticketCode(c.startDate)}</code>
</div>
</article>
${footer(opts.message, todayISO)}
</section>`;
}

// ---------- Recibos de precio: dropoff y Cashea ----------
// Solo se animan transform y opacity. El estado base de cada elemento es el final,
// así en modo lite (sin animaciones) la pantalla queda completa.
const DIGITS = '01234567890123456789'.split('').map((n) => `<i>${n}</i>`).join('');

/** Contador que rueda: cada dígito es una tira 0-9 dos veces; --a = dígito de partida, --b = 10 + dígito final. */
export function odometer(value, from = 0) {
  const to = String(Math.max(0, Math.trunc(value)));
  const start = String(Math.max(0, Math.trunc(from))).padStart(to.length, '0').slice(-to.length);
  return [...to]
    .map((ch, i) => `<span class="od"><span class="tira" style="--a:${Number(start[i])};--b:${10 + Number(ch)};--i:${i}">${DIGITS}</span></span>`)
    .join('');
}

// Confeti determinista (sin azar: mismas piezas en cada render).
const CONFETI_COLORS = ['#ffe200', '#ffffff', '#a3243b'];
const confeti = () => `<div class="confeti" aria-hidden="true">${Array.from({ length: 14 }, (_, i) => {
  const x = (i * 137 + 40) % 1840;
  const d = (i * 53) % 420;
  const t = 1500 + ((i * 211) % 900);
  const r = (i % 2 ? -1 : 1) * (240 + ((i * 97) % 480));
  const w = 16 + ((i * 7) % 16);
  return `<i style="--x:${x}px;--d:${d}ms;--t:${t}ms;--r:${r}deg;--c:${CONFETI_COLORS[i % 3]};--w:${w}px"></i>`;
}).join('')}</div>`;

/**
 * mode: 'entra' (secuencia completa, el recibo se imprime) · 'sigue' (viene de otro paso del cierre:
 * el recibo ya está, cambian los precios) · 'quieto' (misma pantalla repintada: sin animación).
 */
function receiptScreen({ cls, mode, title, sub, lis, many, totLabel, totValue, bigPrefix, bigValue, bigFrom, bigLabel, small, todayISO }) {
  const teeth = '<i></i>'.repeat(19);
  return `<section class="screen b dropoff ${mode}${cls ? ` ${cls}` : ''}">
<i class="flash" aria-hidden="true"></i>
<img class="d3-logo" src="${LOGO_DARK}" alt="0800">
<div class="ranura"></div>
<div class="recibo-w"><div class="recibo-m">
<div class="recibo${many ? ' ap' : ''}">
<img class="lg" src="${LOGO_LIGHT}" alt="0800">
<h1 class="d">${title}</h1>
<p class="sub">${sub}</p>
<hr>
<ul>${lis}</ul>
<hr>
<p class="tot"><span>${totLabel}</span><b class="d">${totValue}</b></p>
${barcode(40)}
<code>${ticketCode(todayISO)}</code>
</div>
<div class="diente" aria-hidden="true">${teeth}</div>
</div></div>
<div class="caida">
<i class="aro" aria-hidden="true"></i>
<b class="pct d" aria-label="${totValue}"><span class="late" aria-hidden="true">${bigPrefix}${odometer(bigValue, bigFrom)}<span class="sg">%</span></span></b>
<p class="d">${bigLabel}</p>
<small>${small}</small>
</div>
${mode === 'quieto' ? '' : confeti()}
</section>`;
}

const modeOf = (prev, same) => (same ? 'quieto' : prev ? 'sigue' : 'entra');

/** opts.prev = pantalla de precio que había justo antes: { type: 'dropoff', percent } | { type: 'cashea' } | null */
export function dropoffScreen(courses, percent, todayISO, opts = {}) {
  const prev = opts.prev ?? null;
  const from = prev && prev.type === 'dropoff' && prev.percent !== percent ? prev.percent : null;
  const rows = buildPriceRows(courses, percent).slice(0, 8);
  const old = from != null ? buildPriceRows(courses, from).slice(0, 8) : [];
  const lis = rows
    .map((r, i) => {
      const was = old[i] && old[i].slug === r.slug ? `<span class="vj">${formatPrice(old[i].after)}</span>` : '';
      return `<li style="--i:${i}"><span>${esc(r.name)}</span><s>${formatPrice(r.before)}</s><b>${was}<span class="nv">${formatPrice(r.after)}</span></b></li>`;
    })
    .join('');
  return receiptScreen({
    cls: '',
    mode: modeOf(prev, prev && prev.type === 'dropoff' && prev.percent === percent),
    title: 'Precio de hoy', sub: 'Cursos presenciales', lis, many: rows.length > 6,
    totLabel: 'Descuento aplicado', totValue: `−${percent}%`,
    bigPrefix: '<span class="sg">−</span>', bigValue: percent, bigFrom: from ?? 0,
    bigLabel: 'en todos los cursos presenciales',
    small: `Precio especial de hoy, ${formatLong(todayISO)}`, todayISO,
  });
}

// Reserva con Cashea: precio de hoy (con el descuento) y la inicial que se paga para reservar.
export function casheaScreen(courses, percent, initialPercent, todayISO, opts = {}) {
  const prev = opts.prev ?? null;
  const rows = buildCasheaRows(courses, percent, initialPercent).slice(0, 8);
  const lis = rows
    .map((r, i) => `<li style="--i:${i}"><span>${esc(r.name)}</span><s>${formatPrice(r.after)}</s><b><span class="nv">${formatPrice(r.initial)}</span></b></li>`)
    .join('');
  return receiptScreen({
    cls: 'cashea',
    mode: modeOf(prev, prev && prev.type === 'cashea'),
    title: 'Reserva hoy', sub: 'Precio de hoy e inicial con Cashea', lis, many: rows.length > 6,
    totLabel: 'Inicial para reservar', totValue: `${initialPercent}%`,
    bigPrefix: '', bigValue: initialPercent, bigFrom: 0,
    bigLabel: 'de inicial con Cashea y reservas tu cupo',
    small: formatLong(todayISO), todayISO,
  });
}

// ---------- Portada: todos los cursos con su miniatura en una sola pantalla ----------
// cartelera = rejilla oscura (cierre) · boletin = lista en papel y tiquetes = uno grande y cuatro chicos (breaks)
const WEEK_ABBR = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'];
const weekdayAbbr = (iso) => {
  const { y, m, d } = parseISO(iso);
  return WEEK_ABBR[(new Date(y, m - 1, d).getDay() + 6) % 7];
};
const precioTxt = (c) => (c.basePrice > 0 ? formatPrice(c.basePrice) : '');

export function portadaScreen(courses, variant, todayISO) {
  const list = courses.filter((c) => !c.finished).sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (variant === 'tiquetes') return portadaTiquetes(list, todayISO);
  if (variant === 'boletin') return portadaBoletin(list, todayISO);
  return portadaCartelera(list, todayISO);
}

function portadaCartelera(list, todayISO) {
  const tiles = list.slice(0, 6).map((c) => {
    const { d } = parseISO(c.startDate);
    return `<article class="tile">
<div class="pic">${thumb(c.slug)}<span class="fb d">${esc(c.name)}</span></div>
<div class="dia"><b class="d">${d}</b><small>${weekdayAbbr(c.startDate)}</small></div>
<div class="bar"><b class="d">${esc(c.name)}</b><span>${precioTxt(c)}</span></div>
</article>`;
  }).join('');
  return `<section class="screen b portada cartelera">
<header class="ph-top"><div><p>Temporada presencial · ${esc(formatLong(todayISO))}</p><h1 class="d">Todos los cursos</h1></div><img src="${LOGO_DARK}" alt="0800"></header>
<div class="grid">${tiles}</div>
</section>`;
}

function portadaBoletin(list, todayISO) {
  const filas = list.slice(0, 6).map((c) => {
    const { d } = parseISO(c.startDate);
    return `<div class="fila">
<div class="dia"><b class="d">${d}</b><span>${weekdayAbbr(c.startDate)}</span></div>
<div class="pic">${thumb(c.slug)}<span class="fb d">${esc(c.name)}</span></div>
<div class="nom"><b class="d">${esc(c.name)}</b></div>
<div class="pre d">${precioTxt(c)}</div>
</div>`;
  }).join('');
  return `<section class="screen c portada boletin">
<header class="ph-top"><h1 class="d">Cursos presenciales</h1><div class="ed"><p>Edición</p><b class="d">${esc(formatLong(todayISO))}</b></div><img src="${LOGO_LIGHT}" alt="0800"></header>
<div class="filas">${filas}</div>
<footer class="pie-p">Reserva con el equipo 0800 al salir</footer>
</section>`;
}

function portadaTiquetes(list, todayISO) {
  const fecha = (c) => {
    const { d, m } = parseISO(c.startDate);
    return `${weekdayAbbr(c.startDate)} ${d} de ${MESES[m - 1].slice(0, 3)}`;
  };
  const [big, ...rest] = list.slice(0, 5);
  const grande = big
    ? `<span class="sello d">El próximo</span>
<article class="tq gr">
<div class="pic">${thumb(big.slug)}<span class="fb d">${esc(big.name)}</span></div>
<div class="me"><small>Curso presencial</small><b class="d">${esc(big.name)}</b></div>
<div class="perf"></div><i class="mu a"></i><i class="mu b"></i>
<div class="tal"><div><small>Fecha</small><b class="d">${fecha(big)}</b></div><div>${barcode(24, 'bc')}<code>${ticketCode(big.startDate)}</code></div></div>
</article>`
    : '';
  const chicos = rest
    .map((c, i) => `<article class="tq ch c${i}">
<div class="pic">${thumb(c.slug)}<span class="fb d">${esc(c.name)}</span></div>
<div class="nm d">${esc(c.name)}</div>
<div class="perf"></div><i class="mu a"></i><i class="mu b"></i>
<div class="pi"><b class="d">${fecha(c)}</b></div>
</article>`)
    .join('');
  return `<section class="screen b portada tiquetes">
<header class="ph-top"><h1 class="d">Lo que viene</h1><div><span>${esc(formatLong(todayISO))}</span><img src="${LOGO_DARK}" alt="0800"></div></header>
${grande}${chicos}
</section>`;
}

// ---------- Anuncio libre (tiquete) ----------
export function announcementScreen(config, todayISO) {
  const title = config.announcement_title ?? '';
  const size = title.length > 110 ? ' xl' : title.length > 64 ? ' largo' : title.length > 40 ? ' medio' : '';
  const date = config.announcement_date;
  let talon = '';
  if (date) {
    const { d, m } = parseISO(date);
    talon = `<div class="talon"><small>Fecha</small><b class="n d">${d}</b><span class="mm d">${MESES[m - 1]}</span>${barcode(28)}<code>${ticketCode(date)}</code></div>`;
  }
  return `<section class="screen b anuncio">
${header()}
<article class="aviso-t${date ? '' : ' solo'}">
<div class="msg">
<small>Aviso</small>
<h1 class="d${size}">${esc(title)}</h1>
${config.announcement_note ? `<p>${esc(config.announcement_note)}</p>` : ''}
</div>
${talon}
</article>
${footer(config.message, todayISO)}
</section>`;
}

export function emptyScreen(text) {
  return `<section class="screen b vacio"><img src="${LOGO_DARK}" alt="0800"><h1 class="d">${esc(text)}</h1></section>`;
}

// ---------- Competencia (póster) ----------
export function leaderboardScreen(model) {
  if (!model.leader) {
    return `<section class="screen b competencia vacio"><img src="${LOGO_LIGHT}" alt="0800"><h1 class="d">Aún no hay participantes</h1></section>`;
  }
  const { title, leader, others, more, recent } = model;
  const len = [...leader.name].length;
  const size = len > 16 ? ' s' : len > 10 ? ' m' : '';
  const pts = leader.points === 1 ? '1 punto' : `${leader.points} puntos`;
  const rows = others
    .map((o, i) => `<div class="fila${o.isRecent ? ' nuevo' : ''}" style="--i:${i}"><span class="r d">${o.rank}</span><span class="nom">${esc(o.name)}</span><span class="pts d">${o.points}</span></div>`)
    .join('');
  const mas = more > 0 ? `<p class="mas">+${more} más</p>` : '';
  const cinta = recent ? `<div class="cinta d">${esc(recent.name)} acaba de sumar un punto</div>` : '';
  return `<section class="screen b competencia">
<img class="logo" src="${LOGO_LIGHT}" alt="0800">
<p class="curso">${title ? `Competencia · ${esc(title)}` : 'Competencia'}</p>
<p class="uno d">1</p>
<div class="lid"><b class="d${size}">${esc(leader.name)}</b><span>${pts}</span></div>
<aside class="panel">
<h2 class="d">Los que vienen detrás</h2>
${rows}${mas}
</aside>
${cinta}
</section>`;
}
