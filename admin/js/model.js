import { buildPriceRows, formatPrice } from '../../js/pricing.js';

export const DROP_PERCENTS = [10, 20, 30, 40, 50];
export const DEFAULT_DROP = 30;

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : '';
}

const upcoming = (courses) => (courses ?? []).filter((c) => !c.finished);
const pinned = (live) => (live?.state?.mode === 'pin' ? live.state.pin_screen : null);

export function screenButtons(courses, live) {
  const pin = pinned(live);
  const list = [{ id: 'calendario', label: 'Calendario', sub: 'Fijo' }];
  for (const c of upcoming(courses)) list.push({ id: `curso:${c.slug}`, label: c.name, sub: shortDate(c.startDate) });
  list.push({ id: 'competencia', label: 'Competencia', sub: 'En vivo' });
  return list.map((b) => ({ ...b, active: pin === b.id }));
}

export function describeNow(live, courses) {
  const s = live?.state;
  if (s?.drop_active === true && s.drop_percent >= 1) return `DROP −${s.drop_percent} % activo`;
  const pin = pinned(live);
  if (!pin) return 'Automático';
  if (pin === 'calendario') return 'Calendario (fijo)';
  if (pin === 'competencia') return 'Competencia (fijo)';
  if (pin.startsWith('curso:')) {
    const c = (courses ?? []).find((x) => x.slug === pin.slice(6));
    return `${c ? c.name : 'Curso'} (fijo)`;
  }
  return 'Automático';
}

export function dropPreview(courses, percent) {
  const rows = buildPriceRows(upcoming(courses), percent);
  return {
    lines: rows.slice(0, 2).map((r) => ({ name: r.name, before: formatPrice(r.before), after: formatPrice(r.after) })),
    more: Math.max(0, rows.length - 2),
  };
}

export function playerRows(live) {
  return (live?.players ?? []).map((p, i) => ({ id: p.id, rank: i + 1, name: p.name, points: p.points }));
}
