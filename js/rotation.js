import { daysBetween } from './dates.js';
import { buildPriceRows } from './pricing.js';

export const LOW_SEATS = 10;

export function daysUntil(startISO, todayISO) {
  return daysBetween(todayISO, startISO);
}

export function badgeFor(days) {
  if (days < 0) return 'EN CURSO';
  if (days === 0) return 'HOY';
  if (days === 1) return 'MAÑANA';
  return null;
}

export function seatState(course) {
  if (course.availableSeats == null) return 'ok';
  if (course.availableSeats <= 0) return 'agotado';
  if (course.availableSeats <= LOW_SEATS) return 'pocos';
  return 'ok';
}

export function buildScreens(courses, config, todayISO) {
  const visible = courses.filter((c) => !config.hidden_courses.includes(c.slug));
  const upcoming = visible.filter((c) => !c.finished);
  const soon = upcoming.filter((c) => daysUntil(c.startDate, todayISO) <= 1);
  const later = upcoming.filter((c) => daysUntil(c.startDate, todayISO) > 1);
  const ordered = [...soon, ...later];

  const screens = [];
  if (config.announcement_title) screens.push({ type: 'anuncio' });

  if (upcoming.length > 0) {
    for (const name of config.screens) {
      if (name === 'calendario') screens.push({ type: 'calendario' });
      else if (name === 'cursos') ordered.forEach((course) => screens.push({ type: 'curso', course }));
    }
  }

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
