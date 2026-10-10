import { MESES, parseISO, addDaysISO, daysBetween } from './dates.js';

export function monthToShow(todayISO, courses) {
  const upcoming = courses.filter((c) => !c.finished).map((c) => c.startDate).sort();
  const t = parseISO(todayISO);
  const thisMonth = todayISO.slice(0, 7);
  const useToday = upcoming.length === 0 || upcoming.some((iso) => iso.startsWith(thisMonth));
  const pick = useToday ? t : parseISO(upcoming[0]);
  return { year: pick.y, month: pick.m - 1 };
}

export function buildMonthGrid(year, month, courses, todayISO) {
  const marks = new Map();
  for (const c of courses.filter((x) => !x.finished)) {
    const span = Math.max(0, daysBetween(c.startDate, c.endDate));
    for (let i = 0; i <= span; i++) {
      const iso = addDaysISO(c.startDate, i);
      if (!marks.has(iso)) marks.set(iso, []);
      marks.get(iso).push(c.slug);
    }
  }

  const pad = (n) => String(n).padStart(2, '0');
  const offset = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells = Array(offset).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${pad(month + 1)}-${pad(day)}`;
    cells.push({ day, iso, marked: marks.get(iso) ?? [], isToday: iso === todayISO });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return { title: `${MESES[month]} ${year}`, weekdays: ['L', 'M', 'M', 'J', 'V', 'S', 'D'], weeks };
}
