const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : '';
}

const upcoming = (courses) => (courses ?? []).filter((c) => !c.finished);
const pinned = (live) => (live?.state?.mode === 'pin' ? live.state.pin_screen : null);

// Botones principales de la pantalla de inicio.
export const MAIN_BUTTONS = [
  { id: 'breaks', label: 'Secuencia de breaks', sub: 'Calendario y cursos rotando' },
  { id: 'competencia', label: 'Competencia en vivo', sub: 'Leaderboard' },
  { id: 'cierre:portada', label: 'Secuencia de cierre', sub: 'Portada, drop 10 %, 30 % y Cashea' },
];

// Pasos de la secuencia de cierre, en orden.
export const CIERRE_STEPS = [
  { id: 'cierre:portada', label: 'Portada de cursos', sub: 'Todos los cursos con su miniatura' },
  { id: 'cierre:10', label: 'Drop −10 %', sub: 'Precio con 10 % de descuento' },
  { id: 'cierre:30', label: 'Drop −30 %', sub: 'Precio con 30 % de descuento' },
  { id: 'cierre:cashea', label: 'Inicial 40 % con Cashea', sub: 'Lo que pagan para reservar' },
];

export const isCierre = (pin) => typeof pin === 'string' && pin.startsWith('cierre:');

export function mainButtons(live) {
  const pin = pinned(live);
  return MAIN_BUTTONS.map((b) => ({
    ...b,
    active: b.id === 'cierre:portada' ? isCierre(pin) : pin === b.id,
  }));
}

// Paso actual de la secuencia de cierre (0 a 3) o -1 si no está activa.
export function cierreIndex(live) {
  return CIERRE_STEPS.findIndex((st) => st.id === pinned(live));
}

export function screenButtons(courses, live) {
  const pin = pinned(live);
  const list = [{ id: 'calendario', label: 'Calendario', sub: 'Fijo' }];
  for (const c of upcoming(courses)) list.push({ id: `curso:${c.slug}`, label: c.name, sub: shortDate(c.startDate) });
  return list.map((b) => ({ ...b, active: pin === b.id }));
}

export function describeNow(live, courses) {
  const pin = pinned(live);
  if (!pin) return 'Automático';
  if (pin === 'breaks') return 'Secuencia de breaks';
  if (pin === 'calendario') return 'Calendario (fijo)';
  if (pin === 'competencia') return 'Competencia en vivo';
  const step = CIERRE_STEPS.find((x) => x.id === pin);
  if (step) return `Cierre: ${step.label}`;
  if (pin.startsWith('curso:')) {
    const c = (courses ?? []).find((x) => x.slug === pin.slice(6));
    return `${c ? c.name : 'Curso'} (fijo)`;
  }
  return 'Automático';
}

export function playerRows(live) {
  return (live?.players ?? []).map((p, i) => ({ id: p.id, rank: i + 1, name: p.name, points: p.points }));
}

// ---------- Emoji chistoso según el nombre (heurística para nombres en español)
const FEM = new Set(['carmen', 'belen', 'isabel', 'raquel', 'pilar', 'rocio', 'ruth', 'beatriz', 'mercedes', 'ines', 'lourdes', 'esther',
  'noemi', 'soledad', 'dolores', 'mar', 'luz', 'paz', 'liz', 'abril', 'maite', 'karen', 'jennifer', 'ingrid', 'maribel', 'elizabeth',
  'yaneth', 'nohemi', 'miriam', 'sol', 'consuelo', 'amparo', 'socorro', 'edith', 'judith', 'astrid', 'brigitte', 'lilian', 'marisol', 'yuliet']);
const MALE_A = new Set(['luca', 'joshua', 'borja', 'nikita', 'jura', 'bautista', 'garcia', 'elia', 'isaia', 'jeremia', 'matia', 'tobia']);
const EM_MALE = ['🦖', '🤠', '🥸', '🐗', '🦁', '🐸', '🥷', '🧔', '🕺', '🤡', '🐻', '🦍', '🐲', '🦬'];
const EM_FEM = ['🦄', '💃', '🦋', '🐙', '👸', '🧚', '🐰', '🦩', '🍑', '🐝', '🧜', '🦢'];
const EM_ANY = ['👽', '🤖', '🦊', '🐧', '🦥', '🐳', '🐼', '🦆', '🐢', '🦉', '🐙', '🦕'];

const fold = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function genderOf(name) {
  const first = fold(String(name ?? '').trim().split(/\s+/)[0] ?? '').replace(/[^a-zñ]/g, '');
  if (first.length < 2) return 'x';
  if (FEM.has(first)) return 'f';
  if (MALE_A.has(first)) return 'm';
  const last = first[first.length - 1];
  if (last === 'a') return 'f';
  if ('osrnldzxkjbmtcgph'.includes(last)) return 'm';
  return 'x';
}

export function funnyEmoji(name, rnd = Math.random) {
  const g = genderOf(name);
  const pool = g === 'f' ? EM_FEM : g === 'm' ? EM_MALE : EM_ANY;
  return pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
}

// Nombre máximo 22 caracteres para que con el emoji y el espacio quepa en los 24 de la base.
export const NAME_MAX = 22;
export const withEmoji = (name, rnd = Math.random) => `${funnyEmoji(name, rnd)} ${name}`;
