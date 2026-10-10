import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { createClient, loadSnapshot, pickCourses, normalizeConfig } from './data.js';
import { buildScreens } from './rotation.js';
import { localISO, formatLong } from './dates.js';
import { calendarScreen, courseScreen, summaryScreen, emptyScreen } from './render.js';

const REFRESH_MS = 5 * 60 * 1000;
const RETRY_MS = 15 * 1000;
const $ = (id) => document.getElementById(id);
const root = document.documentElement;

const params = new URLSearchParams(location.search);
if (params.get('tema') === 'claro') root.dataset.theme = 'claro';
if (params.has('lite')) root.classList.add('lite');

const client = createClient({ url: SUPABASE_URL, key: SUPABASE_KEY });
const storage = (() => {
  try { return window.localStorage; } catch { return null; }
})();

const state = { courses: [], config: normalizeConfig(null), online: true, loaded: false, screens: [], index: 0 };
let timer = null;
let firstLoad = true;

function fit() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  $('stage').style.transform = `translate(-50%, -50%) scale(${s})`;
}

function tick() {
  const now = new Date();
  $('time').textContent = now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false });
  $('date').textContent = formatLong(localISO(now));
}

const visibleCourses = () => state.courses.filter((c) => !state.config.hidden_courses.includes(c.slug));

function rebuild() {
  state.screens = state.loaded
    ? buildScreens(state.courses, state.config, localISO())
    : [{ type: 'conectando' }];
  if (state.index >= state.screens.length) state.index = 0;
}

function html(screen) {
  const today = localISO();
  switch (screen.type) {
    case 'calendario': return calendarScreen(visibleCourses(), today);
    case 'curso': return courseScreen(screen.course, today);
    case 'resumen': return summaryScreen(visibleCourses(), today);
    case 'conectando': return emptyScreen('Conectando…');
    default: return emptyScreen('Próximamente');
  }
}

function animateCounts(scope) {
  if (root.classList.contains('lite') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  scope.querySelectorAll('[data-count]').forEach((el) => {
    const to = Number(el.dataset.count);
    const t0 = performance.now();
    const D = 700;
    (function step(t) {
      const p = Math.min(1, (t - t0) / D);
      el.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  });
}

function show() {
  clearTimeout(timer);
  const screen = state.screens[state.index];
  const secs = state.config.seconds_per_screen;
  $('host').innerHTML = html(screen);
  animateCounts($('host'));
  $('progress').innerHTML = `<i style="--dur:${secs}s"></i>`;
  $('msg').textContent = state.config.message ?? '';
  $('stage').classList.toggle('offline', !state.online);
  if (state.screens.length > 1) timer = setTimeout(next, secs * 1000);
}

function next() {
  state.index = (state.index + 1) % state.screens.length;
  show();
}

async function refresh() {
  const snap = await loadSnapshot(client, storage);
  if (snap) {
    state.courses = pickCourses(snap.rows, localISO());
    state.config = snap.config;
    state.online = snap.online;
    state.loaded = true;
  } else if (!state.loaded) {
    state.online = false;
  }
  rebuild();
  if (firstLoad || state.screens.length === 1) {
    firstLoad = false;
    show();
  } else {
    $('stage').classList.toggle('offline', !state.online);
  }
}

async function refreshLoop() {
  await refresh();
  setTimeout(refreshLoop, state.loaded ? REFRESH_MS : RETRY_MS);
}

function measureFps(ms = 3000) {
  return new Promise((resolve) => {
    let frames = 0;
    const t0 = performance.now();
    requestAnimationFrame(function f(t) {
      frames++;
      if (t - t0 < ms) requestAnimationFrame(f);
      else resolve(frames / ((t - t0) / 1000));
    });
  });
}

async function watchPerf() {
  if (root.classList.contains('lite')) return;
  const fps = await measureFps();
  if (fps < 24) root.classList.add('lite');
  else setTimeout(watchPerf, 2 * 60 * 1000);
}

fit();
addEventListener('resize', fit);
tick();
setInterval(tick, 10000);
refreshLoop();
setTimeout(watchPerf, 4000);
window.__tv = { refresh, state };
