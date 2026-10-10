import { formatLong, formatShort, parseISO } from './dates.js';
import { daysUntil, badgeFor, seatState } from './rotation.js';
import { monthToShow, buildMonthGrid } from './calendar.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const where = (c) => [c.city, c.location].filter(Boolean).join(' · ');

function daysLabel(days) {
  if (days < 0) return 'En curso';
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  return `en ${days} días`;
}

export function calendarScreen(courses, todayISO) {
  const { year, month } = monthToShow(todayISO, courses);
  const g = buildMonthGrid(year, month, courses, todayISO);
  const head = g.weekdays.map((w) => `<span class="wd">${w}</span>`).join('');
  const cells = g.weeks
    .flat()
    .map((cell, i) =>
      cell
        ? `<span class="cell${cell.marked.length ? ' marked' : ''}${cell.isToday ? ' today' : ''}" style="--i:${i}">${cell.day}</span>`
        : '<span class="cell empty"></span>')
    .join('');
  const rows = courses
    .filter((c) => !c.finished)
    .map(
      (c, i) => `<li class="row" style="--i:${i}"><span class="chip display">${parseISO(c.startDate).d}</span><div><b>${esc(c.name)}</b><small>${formatShort(c.startDate)}</small></div><span class="dleft">${daysLabel(daysUntil(c.startDate, todayISO))}</span></li>`)
    .join('');
  return `<section class="screen calendario"><div class="cal"><h1 class="display">${g.title}</h1><div class="grid">${head}${cells}</div></div><ul class="list">${rows}</ul></section>`;
}

export function courseScreen(c, todayISO) {
  const days = daysUntil(c.startDate, todayISO);
  const badge = c.finished ? 'FINALIZADO' : badgeFor(days);
  const state = seatState(c);

  const seatsKpi =
    state === 'agotado'
      ? '<div class="kpi warn"><span class="val display">AGOTADO</span></div>'
      : `<div class="kpi${state === 'pocos' ? ' warn pulse' : ''}"><span class="val display num" data-count="${c.availableSeats}">${c.availableSeats}</span><span class="lbl">cupos disponibles</span></div>`;
  const daysKpi =
    !c.finished && days > 1
      ? `<div class="kpi"><span class="val display num" data-count="${days}">${days}</span><span class="lbl">días para empezar</span></div>`
      : '';
  const kpis = c.finished ? '' : `<div class="kpis">${daysKpi}${seatsKpi}</div>`;
  const place = where(c);

  return `<section class="screen curso" data-slug="${esc(c.slug)}">
<div class="thumb"><img src="assets/cursos/${esc(c.slug)}.jpg" alt="" onerror="this.parentNode.classList.add('nothumb')"><span class="fallback display">${esc(c.name)}</span></div>
<div class="info">${badge ? `<span class="badge${c.finished ? ' done' : ''}">${badge}</span>` : ''}
<span class="eyb">Presencial</span>
<h1 class="fecha display">${formatLong(c.startDate)}</h1>
${place ? `<p class="lugar">${esc(place)}</p>` : ''}
${kpis}</div></section>`;
}

export function summaryScreen(courses, todayISO) {
  const rows = courses
    .map((c, i) => {
      const days = daysUntil(c.startDate, todayISO);
      const state = seatState(c);
      const seats = c.finished
        ? 'Finalizado'
        : state === 'agotado'
          ? '<span class="warn">AGOTADO</span>'
          : `<span class="${state === 'pocos' ? 'warn' : ''}">${c.availableSeats} cupos</span>`;
      return `<div class="tr${c.finished ? ' done' : ''}" style="--i:${i}"><b>${esc(c.name)}</b><span>${formatShort(c.startDate)}</span><span>${c.finished ? '' : daysLabel(days)}</span>${seats}</div>`;
    })
    .join('');
  return `<section class="screen resumen"><h1 class="display">Próximos cursos</h1><div class="tbl">${rows}</div></section>`;
}

export function emptyScreen(text) {
  return `<section class="screen vacio"><h1 class="display">${esc(text)}</h1></section>`;
}
