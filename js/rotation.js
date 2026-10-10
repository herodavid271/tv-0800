import { daysBetween } from './dates.js';
import { buildPriceRows } from './pricing.js';

export const LOW_SEATS = 10;

export function daysUntil(startISO, todayISO) {
  return daysBetween(todayISO, startISO);
}

const sameScreen = (a, b) =>
  a.type === b.type && (a.type !== 'curso' || a.course?.slug === b.course?.slug);

// Indice de la pantalla equivalente en la lista nueva; si no existe, el ultimo
// (el siguiente next() vuelve a la pantalla 0).
export function findScreenIndex(oldScreens, oldIndex, newScreens) {
  const prev = oldScreens[oldIndex];
  if (prev) {
    const i = newScreens.findIndex((s) => sameScreen(prev, s));
    if (i >= 0) return i;
  }
  return newScreens.length - 1;
}

export function seatState(course) {
  if (course.availableSeats == null) return 'ok';
  if (course.availableSeats <= 0) return 'agotado';
  if (course.availableSeats <= LOW_SEATS) return 'pocos';
  return 'ok';
}

export function buildScreens(courses, config, todayISO, live, { breaks = false } = {}) {
  const visible = courses.filter((c) => !config.hidden_courses.includes(c.slug));
  const upcoming = visible.filter((c) => !c.finished);
  const soon = upcoming.filter((c) => daysUntil(c.startDate, todayISO) <= 1);
  const later = upcoming.filter((c) => daysUntil(c.startDate, todayISO) > 1);
  const ordered = [...soon, ...later];

  if (breaks) {
    const rot = upcoming.length > 0
      ? [{ type: 'portada', variant: 'boletin' }, { type: 'calendario' }, ...ordered.map((course) => ({ type: 'curso', course }))]
      : [];
    return rot.length ? rot : [{ type: 'vacio' }];
  }

  const screens = [];
  if (config.announcement_title) screens.push({ type: 'anuncio' });

  if (upcoming.length > 0) {
    for (const name of config.screens) {
      if (name === 'calendario') screens.push({ type: 'calendario' });
      else if (name === 'cursos') ordered.forEach((course) => screens.push({ type: 'curso', course }));
    }
  }

  if (live?.players?.length > 0) screens.push({ type: 'competencia' });

  const percent = config.discount_percent;
  if (
    config.discount_active === true &&
    percent >= 1 && percent <= 90 &&
    buildPriceRows(visible, percent).length > 0
  ) {
    screens.push({ type: 'dropoff', percent });
  }

  return screens.length ? screens : [{ type: 'vacio' }];
}
