import { pickCourses } from '../../js/data.js';
import { DEFAULT_LIVE, RECENT_MS } from '../../js/live.js';
import { localISO } from '../../js/dates.js';
import { CIERRE_STEPS, NAME_MAX, mainButtons, cierreIndex, screenButtons, describeNow, playerRows, withEmoji } from './model.js';

const LIVE_MS = 2000;
const EDITIONS_MS = 60000;
const CONFIRM_MS = 3000;
const GENERIC_ERROR = 'No se pudo, reintenta';
const LOGO = '../assets/logo-0800-blanco.png';

const ICONS = {
  pantalla: '<rect x="3" y="4" width="18" height="12" rx="2"></rect><path d="M8 20h8M12 16v4"></path>',
  cierre: '<path d="M20 12l-8 8-9-9V4h7z"></path><circle cx="7.5" cy="8.5" r="1.2"></circle>',
  competencia: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"></path><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"></path>',
  auto: '<path d="M20 12a8 8 0 1 1-2.5-5.8"></path><path d="M20 4v5h-5"></path>',
};
const TABS = [['pantalla', 'Pantalla'], ['cierre', 'Cierre'], ['competencia', 'Competencia']];

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function icon(name) {
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name]; // constante propia, nunca datos
  return s;
}
export function start(api, root) {
  const S = {
    session: null, view: 'pantalla', live: DEFAULT_LIVE, courses: [], online: true,
    pending: new Set(), mutTok: 0, armedReset: false, resetTimer: null, toastTimer: null,
    scoreSeq: 0, scoring: {}, repoll: false, lastSig: null,
    started: false, loginMsg: '', email: '', draftName: '',
  };

  // ---------- avisos
  function toast(msg, { error = false, action = null } = {}) {
    clearTimeout(S.toastTimer);
    root.querySelectorAll('.aviso').forEach((n) => n.remove());
    const t = el('div', 'aviso' + (error ? ' error' : ''));
    t.setAttribute('role', 'status');
    t.appendChild(el('span', null, msg));
    if (action) {
      const b = el('button', null, action.label);
      b.type = 'button';
      b.addEventListener('click', () => { t.remove(); action.run(); });
      t.appendChild(b);
    }
    root.appendChild(t);
    S.toastTimer = setTimeout(() => t.remove(), action ? 5000 : 3500);
  }
  function errText(e) { return e && e.code && e.code !== 'error' ? e.message : GENERIC_ERROR; }

  // ---------- acciones
  async function run(key, fn) {
    if (S.pending.has(key)) return null;
    S.pending.add(key);
    S.mutTok += 1;
    renderLive();
    try {
      return { value: await fn() };
    } catch (e) {
      if (e && (e.code === 'auth' || e.code === 'forbidden')) await kickOut(e);
      else toast(errText(e), { error: true });
      return null;
    } finally {
      S.pending.delete(key);
      S.mutTok += 1;
      renderLive();
    }
  }
  async function kickOut(e) {
    S.loginMsg = e.message;
    try { await api.signOut(); } catch { /* ya sin sesión */ }
    S.session = null;
    showLogin();
  }
  const busy = (key) => S.pending.has(key);
  const setState = (patch) => { S.live = { ...S.live, state: { ...S.live.state, ...patch } }; };

  const actions = {
    pin: async (id) => { await run('pin', async () => { setState({ mode: 'pin', pin_screen: id }); renderLive(); await api.pin(id); }); pollLive(true); },
    auto: async () => { await run('pin', async () => { setState({ mode: 'auto', pin_screen: null }); renderLive(); await api.auto(); }); pollLive(true); },
    // Siguiente paso de la secuencia de cierre: 10 % → 30 % → inicial Cashea.
    async cierreNext() {
      const i = cierreIndex(S.live);
      const step = CIERRE_STEPS[Math.min(i + 1, CIERRE_STEPS.length - 1)];
      await actions.pin(step.id);
    },
    async score(p) {
      S.scoreSeq += 1;
      S.scoring[p.id] = (S.scoring[p.id] || 0) + 1;
      const r = await run(`score:${p.id}:${S.scoreSeq}`, () => api.score(p.id));
      S.scoring[p.id] -= 1;
      if (!S.scoring[p.id]) delete S.scoring[p.id];
      renderLive();
      if (r) toast(`${p.name} +1`, { action: { label: 'Deshacer', run: actions.undo } });
      pollLive(true);
    },
    async undo() {
      const r = await run('undo', () => api.undo());
      if (r) toast(r.value ? `Se quitó 1 punto a ${r.value.name}` : 'No hay nada que deshacer');
      pollLive(true);
    },
    async add(input) {
      const clean = input.value.trim().slice(0, NAME_MAX);
      if (!clean) return;
      const name = withEmoji(clean); // emoji al azar según el nombre; el servidor le pone el primer punto
      // El campo se limpia al instante para poder escribir el siguiente nombre sin esperar a la red;
      // si el guardado falla, el nombre vuelve al campo (solo si sigue vacío).
      input.value = ''; S.draftName = '';
      S.addSeq = (S.addSeq || 0) + 1;
      const r = await run(`add:${S.addSeq}`, () => api.addPlayer(name));
      if (!r && !input.value) { input.value = clean; S.draftName = clean; }
      pollLive(true);
    },
    async reset() {
      if (!S.armedReset) {
        S.armedReset = true;
        clearTimeout(S.resetTimer);
        S.resetTimer = setTimeout(() => { S.armedReset = false; renderLive(); }, CONFIRM_MS);
        renderLive();
        return;
      }
      clearTimeout(S.resetTimer);
      S.armedReset = false;
      const r = await run('reset', () => api.resetCompetition());
      if (r) toast('Competencia nueva');
      pollLive(true);
    },
  };

  // ---------- estructura
  let dyn = {}; // referencias a las zonas dinámicas de la vista actual

  function header() {
    const top = el('header', 'top');
    const logo = el('img');
    logo.src = LOGO; logo.alt = '0800';
    const estado = el('span', 'estado');
    estado.appendChild(el('i'));
    estado.appendChild(el('em', null, ''));
    estado.lastChild.style.fontStyle = 'normal';
    top.append(logo, estado);
    dyn.estado = estado;
    return top;
  }
  function tabs() {
    const nav = el('nav', 'tabs');
    dyn.tabs = {};
    for (const [id, label] of TABS) {
      const b = el('button', 'tab');
      b.type = 'button';
      b.append(icon(id), document.createTextNode(label));
      b.addEventListener('click', () => { if (S.view !== id) { S.view = id; showApp(); } });
      nav.appendChild(b);
      dyn.tabs[id] = b;
    }
    return nav;
  }

  function showApp() {
    S.started = true;
    root.className = 'ph';
    root.textContent = '';
    dyn = {};
    S.lastSig = null;
    root.appendChild(header());
    if (S.view === 'pantalla') buildPantalla();
    else if (S.view === 'cierre') buildCierre();
    else buildCompetencia();
    root.appendChild(tabs());
    window.scrollTo(0, 0);
    renderLive();
  }

  function buildPantalla() {
    const h = el('h1', 'd', 'Qué ve el TV');
    const ahora = el('div', 'ahora');
    const fila = el('div', 'fila-ahora');
    dyn.ahoraTxt = el('b');
    dyn.ahoraTag = el('span');
    fila.append(dyn.ahoraTxt, dyn.ahoraTag);
    ahora.append(el('small', null, 'Ahora en el TV'), fila);
    dyn.main = el('div', 'principales');
    dyn.rejilla = el('div', 'rejilla');
    dyn.auto = el('button', 'auto');
    dyn.auto.type = 'button';
    dyn.auto.append(icon('auto'), document.createTextNode('Volver a automático'));
    dyn.auto.addEventListener('click', () => actions.auto());
    const salir = el('button', 'salir', 'Cerrar sesión');
    salir.type = 'button';
    salir.addEventListener('click', async () => {
      try { await api.signOut(); } catch { /* ignora */ }
      S.session = null; S.loginMsg = ''; showLogin();
    });
    root.append(h, ahora, dyn.main, el('h2', 'sec-t', 'Otras pantallas'), dyn.rejilla, dyn.auto, salir);
  }

  function buildCierre() {
    root.append(el('h1', 'd', 'Secuencia de cierre'), el('p', 'sub', 'Empieza con el drop de 10 %. Con cada toque en Siguiente el TV sube al próximo paso.'));
    dyn.pasos = el('div', 'pasos');
    dyn.paso = [];
    CIERRE_STEPS.forEach((st, i) => {
      const b = el('button', 'paso');
      b.type = 'button';
      b.append(el('span', 'num d', String(i + 1)), el('span', 'txt'));
      b.lastChild.append(el('b', null, st.label), el('small', null, st.sub));
      b.addEventListener('click', () => actions.pin(st.id));
      dyn.pasos.appendChild(b);
      dyn.paso.push(b);
    });
    dyn.next = el('button', 'siguiente');
    dyn.next.type = 'button';
    dyn.next.addEventListener('click', () => actions.cierreNext());
    dyn.fin = el('button', 'sec', 'Terminar secuencia');
    dyn.fin.type = 'button';
    dyn.fin.addEventListener('click', () => actions.auto());
    root.append(dyn.pasos, dyn.next, dyn.fin);
  }

  function buildCompetencia() {
    root.appendChild(el('h1', 'd', 'Competencia'));
    const form = el('form', 'nuevo');
    form.noValidate = true;
    const input = el('input');
    input.type = 'text'; input.maxLength = NAME_MAX; input.placeholder = 'Nombre del participante';
    input.setAttribute('autocomplete', 'off'); input.setAttribute('enterkeyhint', 'done'); input.setAttribute('aria-label', 'Nombre del participante');
    input.value = S.draftName;
    input.addEventListener('input', () => { S.draftName = input.value; });
    dyn.addBtn = el('button', null, 'Agregar');
    dyn.addBtn.type = 'submit';
    form.append(input, dyn.addBtn);
    form.addEventListener('submit', (ev) => { ev.preventDefault(); actions.add(input); });
    dyn.lista = el('div', 'lista');
    const barra = el('div', 'barra');
    dyn.undo = el('button', null, 'Deshacer último');
    dyn.undo.type = 'button';
    dyn.undo.addEventListener('click', () => actions.undo());
    dyn.reset = el('button', 'peligro', 'Nueva competencia');
    dyn.reset.type = 'button';
    dyn.reset.addEventListener('click', () => actions.reset());
    barra.append(dyn.undo, dyn.reset);
    root.append(form, dyn.lista, barra);
  }

  // ---------- pintado de lo que cambia con cada consulta
  function renderLive() {
    if (!S.started || !dyn.estado) return;
    const nowMs = Date.parse(S.live.serverTime);
    const recentId = S.live.players.find((p) => !Number.isNaN(nowMs) && p.lastScoredAt && nowMs - Date.parse(p.lastScoredAt) < RECENT_MS)?.id ?? null;
    const sig = JSON.stringify([S.view, { ...S.live, serverTime: null }, recentId, S.courses, [...S.pending], S.scoring, S.armedReset, S.online]);
    if (sig === S.lastSig) return;
    S.lastSig = sig;
    dyn.estado.classList.toggle('off', !S.online);
    dyn.estado.lastChild.textContent = S.online ? 'TV conectado' : 'Sin conexión';
    for (const [id, b] of Object.entries(dyn.tabs || {})) b.classList.toggle('on', id === S.view);

    const st = S.live.state;
    if (S.view === 'pantalla') {
      dyn.ahoraTxt.textContent = describeNow(S.live, S.courses);
      dyn.ahoraTag.textContent = st.mode === 'pin' ? 'Fijo' : 'Auto';
      dyn.main.textContent = '';
      for (const b of mainButtons(S.live)) {
        const n = el('button', 'grande' + (b.active ? ' on' : ''));
        n.type = 'button';
        n.append(el('b', 'd', b.label), el('small', null, b.sub));
        n.disabled = busy('pin');
        n.addEventListener('click', async () => {
          await actions.pin(b.id);
          if (b.id === 'cierre:10') { S.view = 'cierre'; showApp(); }
        });
        dyn.main.appendChild(n);
      }
      dyn.rejilla.textContent = '';
      for (const b of screenButtons(S.courses, S.live)) {
        const n = el('button', 'esc' + (b.active ? ' on' : ''));
        n.type = 'button';
        n.append(el('small', null, b.sub), document.createTextNode(b.label));
        n.disabled = busy('pin');
        n.addEventListener('click', () => actions.pin(b.id));
        dyn.rejilla.appendChild(n);
      }
      dyn.auto.disabled = busy('pin') || st.mode !== 'pin';
    } else if (S.view === 'cierre') {
      const idx = cierreIndex(S.live);
      dyn.paso.forEach((b, i) => {
        b.classList.toggle('on', i === idx);
        b.classList.toggle('hecho', idx >= 0 && i < idx);
        b.disabled = busy('pin');
      });
      dyn.next.textContent = idx < 0 ? `Iniciar: ${CIERRE_STEPS[0].label}` : idx < CIERRE_STEPS.length - 1 ? `Siguiente: ${CIERRE_STEPS[idx + 1].label}` : 'Último paso en pantalla';
      dyn.next.disabled = busy('pin') || idx === CIERRE_STEPS.length - 1;
      dyn.fin.disabled = busy('pin') || idx < 0;
    } else {
      const rows = playerRows(S.live);
      const now = Date.parse(S.live.serverTime);
      const recent = S.live.players.find((p) => !Number.isNaN(now) && p.lastScoredAt && now - Date.parse(p.lastScoredAt) < RECENT_MS);
      dyn.lista.textContent = '';
      if (!rows.length) dyn.lista.appendChild(el('p', 'vacio', 'Aún no hay participantes. Agrega el primero arriba.'));
      for (const r of rows) {
        const f = el('div', 'fila' + (recent && recent.id === r.id ? ' rec' : ''));
        const more = el('button', 'mas', '+1');
        more.type = 'button';
        more.setAttribute('aria-label', `Sumar un punto a ${r.name}`);
        more.classList.toggle('pend', !!S.scoring[r.id]);
        more.addEventListener('click', () => actions.score(r));
        f.append(el('span', 'n', String(r.rank)), el('span', 'nom', r.name), el('span', 'pts', String(r.points)), more);
        dyn.lista.appendChild(f);
      }
      dyn.addBtn.disabled = busy('add');
      dyn.undo.disabled = busy('undo');
      dyn.reset.disabled = busy('reset');
      dyn.reset.classList.toggle('armado', S.armedReset);
      dyn.reset.textContent = S.armedReset ? 'Toca de nuevo para confirmar' : 'Nueva competencia';
    }
  }

  // ---------- entrar
  function showLogin() {
    S.started = false;
    dyn = {};
    root.className = 'ph sin-tabs';
    root.textContent = '';
    const box = el('div', 'login');
    const logo = el('img', 'logo');
    logo.src = LOGO; logo.alt = '0800';
    const msg = el('p', 'nota' + (S.loginMsg ? ' err' : ''), S.loginMsg || 'El teléfono te recuerda: no tendrás que repetir esto cada clase.');
    msg.setAttribute('role', 'status');

    const emailLabel = el('label', 'campo');
    emailLabel.appendChild(el('span', null, 'Correo'));
    const email = el('input');
    email.type = 'email'; email.autocomplete = 'username';
    email.setAttribute('autocapitalize', 'off'); email.setAttribute('autocorrect', 'off'); email.inputMode = 'email';
    email.value = S.email || DEFAULT_EMAIL;
    emailLabel.appendChild(email);

    const passLabel = el('label', 'campo');
    passLabel.appendChild(el('span', null, 'Clave'));
    const pass = el('input');
    pass.type = 'password'; pass.autocomplete = 'current-password'; pass.maxLength = 200;
    passLabel.appendChild(pass);
    const enter = el('button', 'boton', 'Entrar');
    enter.type = 'button';

    const note = (t, err) => { msg.textContent = t; msg.className = 'nota' + (err ? ' err' : ''); };
    const wait = (secs) => {
      const m = Math.ceil(secs / 60);
      return m > 1 ? `${m} minutos` : 'un minuto';
    };

    enter.addEventListener('click', async () => {
      const v = email.value.trim();
      if (!v || !pass.value) { note('Escribe tu correo y tu clave', true); return; }
      S.email = v; enter.disabled = true;
      try {
        await api.login(v, pass.value);
        pass.value = '';
        S.loginMsg = '';
        S.session = await api.session();
        if (S.session) { S.view = 'pantalla'; showApp(); }
      } catch (e) {
        if (e.code === 'offline') note(e.message, true);
        else if (e.code === 'locked') note(`Demasiados intentos. Espera ${wait(e.retrySeconds)} e intenta de nuevo.`, true);
        else note('Correo o clave incorrectos', true);
        pass.select();
      } finally { enter.disabled = false; }
    });
    pass.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') enter.click(); });
    email.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') pass.focus(); });

    box.append(logo, el('h1', 'd', 'Control del TV'), el('p', 'sub', 'Entra con tu clave.'), emailLabel, passLabel, enter, msg);
    root.appendChild(box);
  }

  // ---------- consultas periódicas
  let liveTimer = null;
  let liveInFlight = false;
  async function pollLive(now = false) {
    if (now) { clearTimeout(liveTimer); liveTimer = null; }
    if (liveInFlight) { if (now) S.repoll = true; return; }
    liveInFlight = true;
    const tok = S.mutTok;
    try {
      const l = await api.live();
      if (tok === S.mutTok) S.live = l; // descarta lecturas anteriores a una acción
      S.online = true;
    } catch {
      S.online = false;
    } finally {
      liveInFlight = false;
      renderLive();
      clearTimeout(liveTimer);
      if (S.repoll) { S.repoll = false; pollLive(true); }
      else liveTimer = setTimeout(pollLive, LIVE_MS);
    }
  }
  async function pollEditions() {
    try {
      S.courses = pickCourses(await api.editions(), localISO());
      renderLive();
    } catch { /* se reintenta en el siguiente ciclo */ }
    finally { setTimeout(pollEditions, EDITIONS_MS); }
  }

  // ---------- arranque
  api.onAuth((session) => {
    S.session = session;
    if (!session && S.started) showLogin();
  });
  (async () => {
    S.session = await api.session();
    if (S.session) showApp(); else showLogin();
    pollLive();
    pollEditions();
  })();
}
