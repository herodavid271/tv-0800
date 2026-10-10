import { pickCourses } from '../../js/data.js';
import { DEFAULT_LIVE, RECENT_MS } from '../../js/live.js';
import { localISO } from '../../js/dates.js';
import { DROP_PERCENTS, DEFAULT_DROP, screenButtons, describeNow, dropPreview, playerRows } from './model.js';

const LIVE_MS = 2000;
const EDITIONS_MS = 60000;
const CONFIRM_MS = 3000;
const GENERIC_ERROR = 'No se pudo, reintenta';
const DROP_KEY = 'tv0800.admin.drop';
const LOGO = '../assets/logo-0800-blanco.png';

const ICONS = {
  pantalla: '<rect x="3" y="4" width="18" height="12" rx="2"></rect><path d="M8 20h8M12 16v4"></path>',
  drop: '<path d="M20 12l-8 8-9-9V4h7z"></path><circle cx="7.5" cy="8.5" r="1.2"></circle>',
  competencia: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"></path><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"></path>',
  auto: '<path d="M20 12a8 8 0 1 1-2.5-5.8"></path><path d="M20 4v5h-5"></path>',
};
const TABS = [['pantalla', 'Pantalla'], ['drop', 'DROP'], ['competencia', 'Competencia']];

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
function readPct() {
  try {
    const v = Number(localStorage.getItem(DROP_KEY));
    return DROP_PERCENTS.includes(v) ? v : DEFAULT_DROP;
  } catch { return DEFAULT_DROP; }
}
function savePct(v) {
  try { localStorage.setItem(DROP_KEY, String(v)); } catch { /* sin almacenamiento */ }
}

export function start(api, root) {
  const S = {
    session: null, view: 'pantalla', live: DEFAULT_LIVE, courses: [], online: true,
    pct: readPct(), pending: new Set(), mutTok: 0, armedReset: false, resetTimer: null, toastTimer: null,
    started: false, loginMsg: '', loginStep: 'email', email: '', draftName: '',
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
    pin: (id) => run('pin', async () => { setState({ mode: 'pin', pin_screen: id }); renderLive(); await api.pin(id); }),
    auto: () => run('pin', async () => { setState({ mode: 'auto', pin_screen: null }); renderLive(); await api.auto(); }),
    drop: () => run('drop', async () => { setState({ drop_active: true, drop_percent: S.pct }); renderLive(); await api.drop(S.pct); }),
    dropOff: () => run('drop', async () => { setState({ drop_active: false, drop_percent: 0 }); renderLive(); await api.dropOff(); }),
    async score(p) {
      const r = await run(`score:${p.id}`, () => api.score(p.id));
      if (r) toast(`${p.name} +1`, { action: { label: 'Deshacer', run: actions.undo } });
      pollLive(true);
    },
    async undo() {
      const r = await run('undo', () => api.undo());
      if (r) toast(r.value ? `Se quitó 1 punto a ${r.value.name}` : 'No hay nada que deshacer');
      pollLive(true);
    },
    async add(input) {
      const name = input.value.trim().slice(0, 24);
      if (!name) return;
      const r = await run('add', () => api.addPlayer(name));
      if (r) { input.value = ''; S.draftName = ''; }
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
    root.appendChild(header());
    if (S.view === 'pantalla') buildPantalla();
    else if (S.view === 'drop') buildDrop();
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
    root.append(h, ahora, dyn.rejilla, dyn.auto, salir);
  }

  function buildDrop() {
    root.append(el('h1', 'd', 'DROP de precio'), el('p', 'sub', 'Elige el descuento y pulsa el botón. El TV muestra los precios cayendo.'));
    const chips = el('div', 'chips');
    dyn.chips = {};
    for (const p of DROP_PERCENTS) {
      const c = el('button', 'chip', `${p}%`);
      c.type = 'button';
      c.addEventListener('click', () => { S.pct = p; savePct(p); renderLive(); });
      chips.appendChild(c);
      dyn.chips[p] = c;
    }
    dyn.drop = el('button', 'drop');
    dyn.drop.type = 'button';
    dyn.dropBig = el('b', 'd', 'DROP');
    dyn.dropSmall = el('small');
    dyn.drop.append(dyn.dropBig, dyn.dropSmall);
    dyn.drop.addEventListener('click', () => actions.drop());
    dyn.vista = el('div', 'vista');
    dyn.off = el('button', 'sec', 'Quitar descuento del TV');
    dyn.off.type = 'button';
    dyn.off.addEventListener('click', () => actions.dropOff());
    root.append(chips, dyn.drop, dyn.vista, dyn.off);
  }

  function buildCompetencia() {
    root.appendChild(el('h1', 'd', 'Competencia'));
    const form = el('form', 'nuevo');
    form.noValidate = true;
    const input = el('input');
    input.type = 'text'; input.maxLength = 24; input.placeholder = 'Nombre del participante';
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
    dyn.estado.classList.toggle('off', !S.online);
    dyn.estado.lastChild.textContent = S.online ? 'TV conectado' : 'Sin conexión';
    for (const [id, b] of Object.entries(dyn.tabs || {})) b.classList.toggle('on', id === S.view);

    const st = S.live.state;
    if (S.view === 'pantalla') {
      const dropOn = st.drop_active && st.drop_percent >= 1;
      dyn.ahoraTxt.textContent = describeNow(S.live, S.courses);
      dyn.ahoraTag.textContent = dropOn ? 'DROP' : st.mode === 'pin' ? 'Fijo' : 'Auto';
      dyn.ahoraTag.className = dropOn ? 'drop-tag' : '';
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
    } else if (S.view === 'drop') {
      const on = st.drop_active && st.drop_percent >= 1;
      const pct = on ? st.drop_percent : S.pct;
      for (const [p, c] of Object.entries(dyn.chips)) { c.classList.toggle('on', Number(p) === S.pct); c.disabled = busy('drop'); }
      dyn.drop.classList.toggle('activo', on);
      dyn.drop.disabled = busy('drop');
      dyn.dropSmall.textContent = on ? `−${st.drop_percent} % activo` : `−${S.pct} % en todos`;
      dyn.off.disabled = busy('drop') || !on;
      const prev = dropPreview(S.courses, pct);
      dyn.vista.textContent = '';
      dyn.vista.appendChild(el('b', null, 'Vista previa en el TV'));
      if (!prev.lines.length) {
        dyn.vista.append(document.createElement('br'), document.createTextNode('No hay cursos con precio'));
      }
      for (const l of prev.lines) {
        dyn.vista.appendChild(document.createElement('br'));
        dyn.vista.append(document.createTextNode(`${l.name}: ${l.before} → `), el('b', null, l.after));
      }
      if (prev.more > 0) {
        dyn.vista.appendChild(document.createElement('br'));
        dyn.vista.append(document.createTextNode(`y ${prev.more} ${prev.more === 1 ? 'curso más' : 'cursos más'}`));
      }
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
        more.disabled = busy(`score:${r.id}`);
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
    const msg = el('p', 'nota' + (S.loginMsg ? ' err' : ''), S.loginMsg || 'Solo entran usuarios del Hub con rol Acceso completo. El teléfono te recuerda: no tendrás que repetir esto cada clase.');
    msg.setAttribute('role', 'status');

    const emailLabel = el('label', 'campo');
    emailLabel.appendChild(el('span', null, 'Correo'));
    const email = el('input');
    email.type = 'email'; email.placeholder = 'tucorreo@ejemplo.com'; email.autocomplete = 'email';
    email.setAttribute('autocapitalize', 'off'); email.setAttribute('autocorrect', 'off'); email.inputMode = 'email';
    email.value = S.email;
    emailLabel.appendChild(email);
    const send = el('button', 'boton', 'Enviar código');
    send.type = 'button';

    const codeWrap = el('label', 'campo');
    codeWrap.appendChild(el('span', null, 'Código del correo'));
    const code = el('input', 'cod');
    code.type = 'text'; code.inputMode = 'numeric'; code.maxLength = 6; code.placeholder = '······';
    code.setAttribute('autocomplete', 'one-time-code'); code.setAttribute('pattern', '[0-9]*');
    code.addEventListener('input', () => { code.value = code.value.replace(/\D/g, '').slice(0, 6); });
    codeWrap.appendChild(code);
    const enter = el('button', 'boton', 'Entrar');
    enter.type = 'button';

    const setStep = (step) => {
      S.loginStep = step;
      codeWrap.hidden = enter.hidden = step !== 'code';
      send.textContent = step === 'code' ? 'Reenviar código' : 'Enviar código';
      send.classList.toggle('sec2', step === 'code');
    };
    const note = (t, err) => { msg.textContent = t; msg.className = 'nota' + (err ? ' err' : ''); };

    send.addEventListener('click', async () => {
      const v = email.value.trim();
      if (!v || !email.checkValidity()) { note('Escribe tu correo del Hub', true); return; }
      S.email = v; send.disabled = true;
      try {
        await api.signInEmail(v);
        setStep('code'); note('Te enviamos un código de 6 dígitos. Revisa tu correo.'); code.focus();
      } catch (e) { note(e.code === 'offline' ? e.message : 'No se pudo enviar el código. Revisa el correo.', true); }
      finally { send.disabled = false; }
    });
    enter.addEventListener('click', async () => {
      if (code.value.length !== 6) { note('El código tiene 6 dígitos', true); return; }
      enter.disabled = true;
      try {
        await api.verifyCode(S.email || email.value.trim(), code.value);
        S.loginMsg = '';
        S.session = await api.session();
        if (S.session) { S.view = 'pantalla'; showApp(); }
      } catch (e) { note(e.code === 'offline' ? e.message : 'Código incorrecto o vencido', true); code.select(); }
      finally { enter.disabled = false; }
    });
    code.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') enter.click(); });
    email.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') send.click(); });

    box.append(logo, el('h1', 'd', 'Control del TV'), el('p', 'sub', 'Entra con tu correo del Hub. Te llega un código de 6 dígitos.'), emailLabel, send, codeWrap, enter, msg);
    root.appendChild(box);
    setStep(S.loginStep);
  }

  // ---------- consultas periódicas
  let liveTimer = null;
  let liveInFlight = false;
  async function pollLive(now = false) {
    if (now) { clearTimeout(liveTimer); liveTimer = null; }
    if (liveInFlight) return;
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
      liveTimer = setTimeout(pollLive, LIVE_MS);
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
