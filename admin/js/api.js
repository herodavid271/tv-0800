import { normalizeLive } from '../../js/live.js';

export const MSG_FORBIDDEN = 'Tu usuario no tiene permiso para controlar el TV';
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
  if (status === 401 || status === '401' || /jwt|not authenticated|AuthSessionMissing/i.test(msg)) {
    return fail('auth', 'Tu sesión terminó, entra de nuevo');
  }
  if (/failed to fetch|networkerror|network request|load failed|fetch|timeout|abort|offline/i.test(msg) || err instanceof TypeError) {
    return fail('offline', MSG_OFFLINE);
  }
  const e = fail('error', msg || 'No se pudo, reintenta');
  return e;
}

export function createApi({ url, key, supabaseLib = globalThis.window?.supabase ?? globalThis.supabase }) {
  const client = supabaseLib.createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  async function rpcOnce(name, args) {
    let res;
    try {
      res = await client.rpc(name, args);
    } catch (e) {
      throw mapError(e);
    }
    if (res.error) throw mapError(res.error);
    return res.data;
  }

  // Un fallo de auth/forbidden se reintenta UNA vez tras refrescar la sesión.
  async function rpc(name, args = {}) {
    try {
      return await rpcOnce(name, args);
    } catch (e) {
      if (e.code !== 'auth' && e.code !== 'forbidden') throw e;
      try { await client.auth.refreshSession?.(); } catch { /* el reintento decide */ }
      return rpcOnce(name, args);
    }
  }

  if (typeof document !== 'undefined' && client.auth.startAutoRefresh) {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    });
  }

  async function authCall(p) {
    let res;
    try {
      res = await p;
    } catch (e) {
      throw mapError(e);
    }
    if (res.error) throw mapError(res.error);
    return res.data;
  }

  return {
    signInEmail: (email) => authCall(client.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })),
    verifyCode: (email, token) => authCall(client.auth.verifyOtp({ email, token, type: 'email' })),
    async session() {
      try {
        const { data } = await client.auth.getSession();
        return data?.session ?? null;
      } catch {
        return null;
      }
    },
    signOut: () => authCall(client.auth.signOut({ scope: 'local' })),
    onAuth: (cb) => client.auth.onAuthStateChange((_event, session) => cb(session)),
    pin: (screen) => rpc('tv_pin', { p_screen: screen }),
    auto: () => rpc('tv_auto'),
    drop: (percent) => rpc('tv_drop', { p_percent: percent }),
    dropOff: () => rpc('tv_drop_off'),
    addPlayer: (name) => rpc('tv_player_add', { p_name: name }),
    removePlayer: (id) => rpc('tv_player_remove', { p_id: id }),
    score: (id) => rpc('tv_score', { p_id: id }),
    undo: () => rpc('tv_undo'),
    resetCompetition: () => rpc('tv_competition_reset'),
    live: async () => normalizeLive(await rpc('tv_live')),
    editions: async () => (await rpc('tv_ediciones')) ?? [],
  };
}
