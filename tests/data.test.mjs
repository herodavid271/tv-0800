import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, pickCourses, createClient, loadSnapshot } from '../js/data.js';

const row = (slug, start, end = start, status = 'active', seats = [60, 30]) => ({
  course_slug: slug, course_name: slug.toUpperCase(), start_date: start, end_date: end,
  city: null, location: null, total_seats: seats[0], available_seats: seats[1], edition_status: status,
});

test('pickCourses toma la edición futura más cercana por curso', () => {
  const out = pickCourses([row('a', '2026-10-22'), row('a', '2026-10-15')], '2026-10-10');
  assert.equal(out.length, 1);
  assert.equal(out[0].startDate, '2026-10-15');
  assert.equal(out[0].finished, false);
  assert.equal(out[0].availableSeats, 30);
  assert.equal(out[0].slug, 'a');
  assert.equal(out[0].name, 'A');
});

test('pickCourses usa la última edición como respaldo y la marca finalizada', () => {
  const out = pickCourses([row('b', '2026-10-01'), row('b', '2026-10-08')], '2026-10-10');
  assert.equal(out[0].startDate, '2026-10-08');
  assert.equal(out[0].finished, true);
});

test('pickCourses trata end_date nula como la fecha de inicio', () => {
  const out = pickCourses([{ ...row('e', '2026-10-15'), end_date: null }], '2026-10-10');
  assert.equal(out[0].finished, false);
  assert.equal(out[0].endDate, '2026-10-15');
});

test('pickCourses no cuenta ediciones con status finished aunque tengan fecha futura', () => {
  const out = pickCourses([row('c', '2026-10-20', '2026-10-20', 'finished')], '2026-10-10');
  assert.equal(out[0].finished, true);
});

test('pickCourses cuenta una edición en curso (empezó ayer, termina mañana)', () => {
  const out = pickCourses([row('d', '2026-10-09', '2026-10-11')], '2026-10-10');
  assert.equal(out[0].finished, false);
});

test('pickCourses ordena próximas por fecha y luego finalizadas', () => {
  const out = pickCourses([
    row('old', '2026-10-01'), row('late', '2026-10-22'), row('soon', '2026-10-15'),
  ], '2026-10-10');
  assert.deepEqual(out.map((c) => c.slug), ['soon', 'late', 'old']);
});

test('normalizeConfig rellena valores por defecto y sanea', () => {
  assert.deepEqual(normalizeConfig(null), DEFAULT_CONFIG);
  const c = normalizeConfig({ screens: null, hidden_courses: null, seconds_per_screen: 1, message: 'Hola' });
  assert.deepEqual(c.screens, DEFAULT_CONFIG.screens);
  assert.deepEqual(c.hidden_courses, []);
  assert.equal(c.seconds_per_screen, 12);
  assert.equal(c.message, 'Hola');
  assert.equal(normalizeConfig({ seconds_per_screen: 20 }).seconds_per_screen, 20);
});

const fakeStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
};
const jsonFetch = (handler) => async (url, init) => {
  const body = handler(url, init);
  if (body instanceof Error) throw body;
  return { ok: true, status: 200, json: async () => body };
};
const ROWS = [row('a', '2026-10-15')];

test('createClient llama al RPC con apikey y a tv_config', async () => {
  const calls = [];
  const client = createClient({
    url: 'https://x.supabase.co', key: 'KEY',
    fetchImpl: jsonFetch((url, init) => { calls.push({ url, init }); return url.includes('rpc/') ? ROWS : [{ id: 1, message: 'm' }]; }),
  });
  assert.deepEqual(await client.editions(), ROWS);
  assert.equal((await client.config()).message, 'm');
  assert.equal(calls[0].url, 'https://x.supabase.co/rest/v1/rpc/tv_ediciones');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.apikey, 'KEY');
  assert.equal(calls[1].url, 'https://x.supabase.co/rest/v1/tv_config?id=eq.1&select=*');
});

test('loadSnapshot online guarda en caché', async () => {
  const storage = fakeStorage();
  const client = { editions: async () => ROWS, config: async () => ({ message: 'hola' }) };
  const snap = await loadSnapshot(client, storage);
  assert.equal(snap.online, true);
  assert.equal(snap.config.message, 'hola');
  assert.ok(storage.getItem('tv0800.cache.v1'));
});

test('loadSnapshot sin red usa la caché y marca offline', async () => {
  const storage = fakeStorage();
  await loadSnapshot({ editions: async () => ROWS, config: async () => ({ message: 'hola' }) }, storage);
  const snap = await loadSnapshot({ editions: async () => { throw new Error('x'); }, config: async () => null }, storage);
  assert.equal(snap.online, false);
  assert.deepEqual(snap.rows, ROWS);
  assert.equal(snap.config.message, 'hola');
});

test('loadSnapshot sin red y sin caché devuelve null', async () => {
  const snap = await loadSnapshot({ editions: async () => { throw new Error('x'); }, config: async () => null }, fakeStorage());
  assert.equal(snap, null);
});

test('loadSnapshot: si falla solo la config conserva la cacheada', async () => {
  const storage = fakeStorage();
  await loadSnapshot({ editions: async () => ROWS, config: async () => ({ hidden_courses: ['a'] }) }, storage);
  const snap = await loadSnapshot({ editions: async () => ROWS, config: async () => { throw new Error('x'); } }, storage);
  assert.equal(snap.online, true);
  assert.deepEqual(snap.config.hidden_courses, ['a']);
});

test('loadSnapshot tolera storage nulo', async () => {
  const snap = await loadSnapshot({ editions: async () => ROWS, config: async () => null }, null);
  assert.equal(snap.online, true);
});
