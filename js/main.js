import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { createClient, loadSnapshot, pickCourses, normalizeConfig } from './data.js';
import { buildScreens } from './rotation.js';
import { localISO } from './dates.js';
import { calendarScreen, courseScreen, dropoffScreen, announcementScreen, emptyScreen, clockText } from './render.js';

const REFRESH_MS = 5 * 60 * 1000;
const RETRY_MS = 15 * 1000;
const $ = (id) => document.getElementById(id);
const root = document.documentElement;

const params = new URLSearchParams(location.search);
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

// Relojes en fichas: reescribe los caracteres existentes, sin volver a renderizar.
function tick() {
  const text = clockText();
  document.querySelectorAll('[data-clock]').forEach((el) => {
    const tiles = el.children;
    if (tiles.length !== text.length) return;
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i].textContent !== text[i]) tiles[i].textContent = text[i];
    }
  });
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
    case 'anuncio': return announcementScreen(state.config, today);
    case 'calendario': return calendarScreen(visibleCourses(), today);
    case 'curso': return courseScreen(screen.course, today, { message: state.config.message });
    case 'dropoff': return dropoffScreen(visibleCourses(), screen.percent, today);
    case 'conectando': return emptyScreen('Conectando…');
    default: return emptyScreen('Próximamente');
  }
}

function show() {
  clearTimeout(timer);
  const screen = state.screens[state.index];
  const secs = state.config.seconds_per_screen;
  try {
    $('host').innerHTML = html(screen);
    $('progress').innerHTML = `<i style="--dur:${secs}s"></i>`;
    $('stage').classList.toggle('offline', !state.online);
  } catch (e) {
    console.error(e);
  } finally {
    if (state.screens.length > 1) timer = setTimeout(next, secs * 1000);
  }
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
  const wasSingle = state.screens.length <= 1;
  rebuild();
  if (firstLoad || wasSingle || state.screens.length === 1) {
    firstLoad = false;
    show();
  } else {
    $('stage').classList.toggle('offline', !state.online);
  }
}

async function refreshLoop() {
  try {
    await refresh();
  } catch (e) {
    console.error(e);
  } finally {
    setTimeout(refreshLoop, state.loaded ? REFRESH_MS : RETRY_MS);
  }
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
