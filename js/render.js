import { formatLong, parseISO, MESES } from './dates.js';
import { daysUntil, seatState } from './rotation.js';
import { monthToShow, buildMonthGrid } from './calendar.js';
import { buildPriceRows, formatPrice } from './pricing.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const pad = (n) => String(n).padStart(2, '0');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const LOGO_WHITE = 'assets/logo-0800-blanco.png';
const LOGO_INK = 'assets/logo-0800.png';
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

const header = () => `<header class="top"><img src="${LOGO_WHITE}" alt="0800">${clock()}</header>`;
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
<div class="etq"><img src="${LOGO_INK}" alt="0800"></div>
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
  return `<p class="seats${state === 'pocos' ? ' warn' : ''}"><small>Cupos disponibles</small><b class="d">${c.availableSeats} de ${c.totalSeats}</b></p>`;
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
<p class="nom"><small>Curso presencial${place ? ` · ${esc(place)}` : ''}</small><b class="d${c.name.length > 22 ? ' largo' : ''}">${esc(c.name)}</b></p>
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

// ---------- Dropoff de precio (recibo) ----------
export function dropoffScreen(courses, percent, todayISO) {
  const rows = buildPriceRows(courses, percent).slice(0, 8);
  const lis = rows
    .map((r) => `<li><span>${esc(r.name)}</span><s>${formatPrice(r.before)}</s><b>${formatPrice(r.after)}</b></li>`)
    .join('');
  const teeth = '<i></i>'.repeat(19);
  return `<section class="screen b dropoff">
<img class="d3-logo" src="${LOGO_WHITE}" alt="0800">
<div class="ranura"></div>
<div class="recibo-w"><div class="recibo-m">
<div class="recibo${rows.length > 6 ? ' ap' : ''}">
<img class="lg" src="${LOGO_INK}" alt="0800">
<h1 class="d">Precio de hoy</h1>
<p class="sub">Cursos presenciales</p>
<hr>
<ul>${lis}</ul>
<hr>
<p class="tot"><span>Descuento aplicado</span><b class="d">−${percent}%</b></p>
${barcode(40)}
<code>${ticketCode(todayISO)}</code>
</div>
<div class="diente" aria-hidden="true">${teeth}</div>
</div></div>
<div class="caida">
<b class="pct d">−${percent}%</b>
<p class="d">en todos los cursos presenciales</p>
<small>Precio especial de hoy, ${formatLong(todayISO)}</small>
</div>
</section>`;
}

// ---------- Anuncio libre (tiquete) ----------
export function announcementScreen(config, todayISO) {
  const title = config.announcement_title ?? '';
  const size = title.length > 64 ? ' largo' : title.length > 40 ? ' medio' : '';
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
  return `<section class="screen b vacio"><img src="${LOGO_WHITE}" alt="0800"><h1 class="d">${esc(text)}</h1></section>`;
}
