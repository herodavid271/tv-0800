import { normalizeLive } from '../../js/live.js';

export const MSG_FORBIDDEN = 'Tu sesión terminó, entra de nuevo';
export const MSG_OFFLINE = 'Sin conexión, reintenta';

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// Convierte cualquier fallo (error de PostgREST, de auth o de red) en un Error con code y mensaje en español.
export function mapError(err) {
  const msg = String(err?.message ?? err ?? '');
  const status = err?.status ?? err?.code;
  if (/forbidden/i.test(msg)) return fail('forbidden', MSG_FORBIDDEN);
  if (/failed to fetch|networkerror|network request|load failed|fetch|timeout|abort|offline/i.test(msg) || err instanceof TypeError) {
    return fail('offline', MSG_OFFLINE);
  }
  const e = fail('error', msg || 'No se pudo, reintenta');
  return e;
}

const TOKEN_KEY = 'tv0800.admin';

function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function createApi({ url, key, supabaseLib = globalThis.window?.supabase ?? globalThis.supabase, storage = defaultStorage() }) {
  const client = supabaseLib.createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  let token = null;
  try { token = storage?.getItem(TOKEN_KEY) || null; } catch { /* sin almacenamiento */ }
  const listeners = [];
  const setToken = (t) => {
    token = t;
    try { if (t) storage?.setItem(TOKEN_KEY, t); else storage?.removeItem(TOKEN_KEY); } catch { /* sin almacenamiento */ }
    listeners.forEach((cb) => cb(t ? { token: t } : null));
  };

  async function rpc(name, args = {}, withToken = false) {
    let res;
    try {
      res = await client.rpc(name, withToken ? { p_token: token, ...args } : args);
    } catch (e) {
      throw mapError(e);
    }
    if (res.error) throw mapError(res.error);
    return res.data;
  }
  const w = (name, args) => rpc(name, args, true);

  return {
    // La clave viaja una sola vez; el servidor devuelve un token de sesión que se guarda en el teléfono.
    async login(email, password) {
      const r = await rpc('tv_login', { p_email: email, p_password: password });
      if (r?.token) { setToken(r.token); return r; }
      const e = fail(r?.error === 'locked' ? 'locked' : 'invalid', '');
      e.retrySeconds = Number(r?.retry_seconds) || 0;
      throw e;
    },
    async session() {
      if (!token) return null;
      try {
        if (await rpc('tv_check', {}, true)) return { token };
      } catch (e) {
        if (e.code === 'offline') return { token }; // sin red no se cierra la sesión
        throw e;
      }
      setToken(null);
      return null;
    },
    async signOut() {
      const t = token;
      setToken(null);
      if (t) { try { await client.rpc('tv_logout', { p_token: t }); } catch { /* el token local ya se borró */ } }
    },
    onAuth: (cb) => { listeners.push(cb); },
    pin: (screen) => w('tv_pin', { p_screen: screen }),
    auto: () => w('tv_auto'),
    drop: (percent) => w('tv_drop', { p_percent: percent }),
    dropOff: () => w('tv_drop_off'),
    addPlayer: (name) => w('tv_player_add', { p_name: name }),
    removePlayer: (id) => w('tv_player_remove', { p_id: id }),
    score: (id) => w('tv_score', { p_id: id }),
    undo: () => w('tv_undo'),
    resetCompetition: () => w('tv_competition_reset'),
    live: async () => normalizeLive(await rpc('tv_live')),
    editions: async () => (await rpc('tv_ediciones')) ?? [],
  };
}
