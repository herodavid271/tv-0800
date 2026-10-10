export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const pad = (n) => String(n).padStart(2, '0');

export function localISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

const utc = (iso) => {
  const { y, m, d } = parseISO(iso);
  return Date.UTC(y, m - 1, d);
};

export function daysBetween(fromISO, toISO) {
  return Math.round((utc(toISO) - utc(fromISO)) / 86400000);
}

export function addDaysISO(iso, n) {
  const dt = new Date(utc(iso) + n * 86400000);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function formatLong(iso) {
  const { y, m, d } = parseISO(iso);
  return `${DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} de ${MESES[m - 1]}`;
}
