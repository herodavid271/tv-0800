import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { createClient, loadSnapshot, pickCourses, normalizeConfig } from './data.js';
import { buildScreens, findScreenIndex } from './rotation.js';
import { localISO } from './dates.js';
import { calendarScreen, courseScreen, dropoffScreen, casheaScreen, portadaScreen, announcementScreen, emptyScreen, leaderboardScreen, clockText } from './render.js';
import { DEFAULT_LIVE, normalizeLive, resolveScreen, buildLeaderboard, liveSignature, isBreaks } from './live.js';

const REFRESH_MS = 5 * 60 * 1000;
const RETRY_MS = 15 * 1000;
const LIVE_MS = 2000;
const $ = (id) => document.getElementById(id);
const root = document.documentElement;

const params = new URLSearchParams(location.search);
if (params.has('lite')) root.classList.add('lite');

const client = createClient({ url: SUPABASE_URL, key: SUPABASE_KEY });
const storage = (() => {
  try { return window.localStorage; } catch { return null; }
})();

const state = { courses: [], config: normalizeConfig(null), online: true, loaded: false, screens: [], index: 0,
  live: DEFAULT_LIVE, breaks: false, price: null, locked: null, resume: null, lastSig: null };
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
  const prev = state.screens;
  const prevIndex = state.index;
  state.screens = state.loaded
    ? buildScreens(state.courses, state.config, localISO(), state.live, { breaks: state.breaks })
    : [{ type: 'conectando' }];
  const placeholder = (list) => list.length <= 1 && ['conectando', 'vacio'].includes(list[0]?.type);
  if (firstLoad || placeholder(prev) || state.screens.length <= 1) state.index = 0;
  else state.index = findScreenIndex(prev, prevIndex, state.screens);
}

// Pantalla de precio pintada justo antes (o null): permite encadenar los pasos del cierre sin reimprimir el recibo.
const priceCtx = (screen) =>
  screen.type === 'dropoff' ? { type: 'dropoff', percent: screen.percent } : screen.type === 'cashea' ? { type: 'cashea' } : null;

function build(screen, prev) {
  const today = localISO();
  switch (screen.type) {
    case 'anuncio': return announcementScreen(state.config, today);
    case 'calendario': return calendarScreen(visibleCourses(), today);
    case 'curso': return courseScreen(screen.course, today, { message: state.config.message });
    case 'dropoff': return dropoffScreen(visibleCourses(), screen.percent, today, { prev });
    case 'portada': return portadaScreen(visibleCourses(), screen.variant, today);
    case 'cashea': return casheaScreen(visibleCourses(), screen.percent, screen.initial, today, { prev });
    case 'competencia': return leaderboardScreen(buildLeaderboard(state.live, visibleCourses(), today));
    case 'conectando': return emptyScreen('Conectando…');
    default: return emptyScreen('Próximamente');
  }
}

function html(screen) {
  const out = build(screen, state.price);
  state.price = priceCtx(screen);
  return out;
}

const lockSigOf = (res) => JSON.stringify([res.key, visibleCourses().map((c) => [c.slug, c.availableSeats, c.basePrice, c.finished])]);
const sigNow = () => liveSignature(state.live, visibleCourses(), localISO());

function show() {
  if (state.locked !== null) return;
  clearTimeout(timer);
  const screen = state.screens[state.index];
  const secs = state.config.seconds_per_screen;
  try {
    $('host').innerHTML = html(screen);
    $('progress').innerHTML = `<i style="--dur:${secs}s"></i>`;
    $('stage').classList.toggle('offline', !state.online);
    state.lastSig = screen.type === 'competencia' ? sigNow() : null;
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
  if (state.locked !== null && state.loaded) {
    const res = resolveScreen(state.live, visibleCourses(), state.config, localISO());
    if (res && res.key === state.locked) {
      const sig = lockSigOf(res);
      if (sig !== state.lockSig) {
        state.lockSig = sig;
        renderLocked(res);
      }
    }
  }
  const wasSingle = state.screens.length <= 1;
  rebuild();
  if (firstLoad || wasSingle || state.screens.length === 1) {
    firstLoad = false;
    show();
    $('stage').classList.toggle('offline', !state.online);
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

// Pantalla fija (pin / DROP): sin rotación ni barra de progreso.
function renderLocked(res) {
  clearTimeout(timer);
  try {
    $('host').innerHTML = html(res.screen);
    $('progress').innerHTML = '';
    $('stage').classList.toggle('offline', !state.online);
    state.lastSig = res.screen.type === 'competencia' ? sigNow() : null;
  } catch (e) {
    console.error(e);
  }
}

const sameList = (a, b) =>
  a.length === b.length && a.every((x, i) => x.type === b[i].type && x.course?.slug === b[i].course?.slug);

async function liveTick() {
  let raw;
  try {
    raw = await client.live();
  } catch (e) {
    console.error(e);
    return;
  }
  const hadPlayers = state.live.players.length > 0;
  state.live = normalizeLive(raw);
  const breaksChanged = isBreaks(state.live) !== state.breaks;
  state.breaks = isBreaks(state.live);
  if (!state.loaded) return; // sin cursos cargados no se fija ni se pinta nada
  const today = localISO();
  const res = resolveScreen(state.live, visibleCourses(), state.config, today);

  if (res) {
    if (res.key !== state.locked) {
      if (state.locked === null) state.resume = { screens: state.screens, index: state.index };
      state.locked = res.key;
      state.lockSig = lockSigOf(res);
      renderLocked(res);
    } else if (res.screen.type === 'competencia' && sigNow() !== state.lastSig) {
      renderLocked(res);
    }
    return;
  }

  if (state.locked !== null) {
    state.locked = null;
    rebuild();
    if (state.resume) state.index = findScreenIndex(state.resume.screens, state.resume.index, state.screens);
    state.resume = null;
    show();
    return;
  }

  if (!state.loaded || firstLoad) return;
  if (breaksChanged) {
    rebuild();
    state.index = Math.min(state.index, state.screens.length - 1);
    show();
    return;
  }
  if (hadPlayers !== (state.live.players.length > 0)) {
    const before = state.screens;
    rebuild();
    if (!sameList(before, state.screens) && (before.length <= 1 || state.screens.length <= 1)) show();
  }
  if (state.screens[state.index]?.type === 'competencia' && sigNow() !== state.lastSig) {
    try {
      $('host').innerHTML = html(state.screens[state.index]);
      state.lastSig = sigNow();
    } catch (e) {
      console.error(e);
    }
  }
}

async function liveLoop() {
  try {
    await liveTick();
  } catch (e) {
    console.error(e);
  } finally {
    setTimeout(liveLoop, LIVE_MS);
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
liveLoop();
setTimeout(watchPerf, 4000);
window.__tv = { refresh, liveRefresh: liveTick, state };
