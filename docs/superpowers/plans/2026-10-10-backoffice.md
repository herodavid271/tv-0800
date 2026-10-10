# Back office TV 0800 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Control remoto del TV desde el iPhone (fijar pantalla, DROP de precio) y competencia con leaderboard en vivo, según `docs/superpowers/specs/2026-10-10-backoffice-design.md`.

**Architecture:** El TV consulta `tv_live()` (RPC pública de solo lectura) cada 2 s; un resolvedor puro decide qué mostrar (DROP > fijo > automático). El teléfono es una web instalable en `/admin/` que inicia sesión con el código por correo del Hub y escribe solo mediante funciones de base de datos que exigen `public.is_admin()`. Sin WebSocket.

**Tech Stack:** HTML/CSS/JS ES modules sin build, Node `node:test`, Supabase (RPC + Auth), `@supabase/supabase-js` v2 vendorizado solo en `/admin/`.

## Global Constraints

- Supabase URL `https://vzwptpbtlzamvumggbth.supabase.co`, llave pública `sb_publishable_RJ7DUni11cRwrl_oFcN4lg_5qglYJWN` (en `js/config.js`).
- El TV solo lee (`tv_live`, `tv_ediciones`, tabla `tv_config`). Nunca escribe. No hay políticas de escritura públicas.
- Prioridad en el TV: **DROP activo** > **modo fijo** > **modo automático**. El DROP solo se aplica si hay al menos un curso con precio (`buildPriceRows` no vacío) y `1 <= drop_percent <= 90`.
- Un punto es "reciente" si `server_time - last_scored_at < 10 s` (hora del servidor, no la del TV).
- Leaderboard en el TV: el líder en grande + hasta 6 más en el panel (lugares 2 a 7); si hay más, "+N más". El título muestra el curso de hoy (empieza hoy o está en curso) si lo hay.
- Solo `transform` y `opacity` se animan; `?lite`/auto-lite y `prefers-reduced-motion` quitan toda animación (salvo la barra de progreso). Compatible con Chrome 80: sin `inset`, sin `gap` en flex (usar márgenes), `gap` solo en grid.
- Todo dato de la base se escapa con `esc()` antes de insertarlo en HTML.
- Aspecto: sin degradados ni blur; amarillo `#FFE200`, borgoña `#A3243B`, tinta `#0E0E0E`, fondo oscuro `#050505`; titulares en Creato Display Black. Maquetas aprobadas en `propuestas/backoffice/` (`tv-lb.css` bloque `.s3`, `l3-poster.dc.html`; `tv-phone.css`, `Main`, `p-pantalla`, `p-drop`, `p-competencia`).
- Cambios en la base de producción: se muestran a David y se aplican solo con su "sí" (lo hace el controlador).
- `npm test` debe quedar en verde. Commits terminan con `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (exactamente ese nombre).

## File Structure

```
sql/004_tv_control_remoto.sql        (ya escrito) tablas y funciones
js/live.js                           normalizeLive, resolveScreen, buildLeaderboard, liveSignature
js/data.js                           (modifica) createClient().live()
js/rotation.js                       (modifica) competencia en la rotación
js/render.js                         (modifica) leaderboardScreen
css/screens.css                      (modifica) estilos del leaderboard (bloque .s3 de la maqueta)
js/main.js                           (modifica) ciclo de consulta live y overrides
admin/index.html styles.css manifest.webmanifest icon-180.png icon-512.png
admin/vendor/supabase.js             cliente oficial fijado a una versión
admin/js/model.js                    modelos puros del teléfono
admin/js/api.js                      funciones RPC con sesión
admin/js/app.js                      interfaz
admin/dev.html                       cliente simulado para verificar sin base de datos
tests/live.test.mjs  admin-model.test.mjs  (y se amplían rotation, data, render)
```

---

### Task 1: Migración SQL (controlador)

**Files:** `sql/004_tv_control_remoto.sql` (ya escrito)

- [ ] Mostrar el SQL a David; con su "sí", aplicar con `apply_migration` (`name: "tv_control_remoto"`).
- [ ] Probar con `execute_sql` simulando sesiones (`set local role`; `set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}'`) usando un usuario real con rol "Acceso completo" y uno sin él, todo dentro de una transacción con `rollback`:
  - `anon`: `tv_live()` funciona; `tv_pin`, `tv_drop`, `tv_player_add` fallan con `forbidden`; `select` directo a `tv_players` falla por permisos.
  - Usuario sin rol: las funciones de escritura fallan con `forbidden`.
  - Administrador: `tv_player_add('Ana')`, dos `tv_score`, `tv_undo` dos veces devuelve puntos 1 y 0 y `last_scored_at` vuelve a null; orden y desempate en `tv_live()`; `tv_drop(0)` y `tv_drop(91)` fallan `invalid_percent`; `tv_pin('xxx')` falla `invalid_screen`; `tv_competition_reset()` vacía todo.
- [ ] Verificar por REST con la llave pública: `POST /rpc/tv_live` responde; `POST /rpc/tv_pin` responde error (sin sesión).
- [ ] Commit.

---

### Task 2: Lógica en vivo (JS puro)

**Files:** Create `js/live.js`, `tests/live.test.mjs`; Modify `js/data.js`, `tests/data.test.mjs`, `js/rotation.js`, `tests/rotation.test.mjs`

**Interfaces:**
- Consumes: `Course`, `Config` (existentes), `buildPriceRows` (`js/pricing.js`), `daysUntil` (`js/rotation.js`).
- Produces:
  - `js/data.js`: `createClient(...).live()` → `POST rpc/tv_live` con body `{}` y el mismo timeout/headers que `editions()`.
  - `js/live.js`:
    - `DEFAULT_LIVE = { state: { mode: 'auto', pin_screen: null, drop_active: false, drop_percent: 0, drop_at: null }, players: [], serverTime: null }`.
    - `normalizeLive(raw): Live` — tolera `null`/forma inválida (devuelve `DEFAULT_LIVE`); `mode` solo es `'pin'` si `pin_screen` es string no vacío; `drop_percent` entero 0 a 90 (otro → 0); `drop_active` solo si `=== true`; `players` = `{ id, name, points, lastScoredAt }` (nombre recortado a 24, `points` entero >= 0 o 0, `lastScoredAt` string o null), conservando el orden recibido; `serverTime` string o null.
    - `resolveScreen(live, courses, config, todayISO): { screen, locked, key } | null` — `null` = automático. `screen` es `{type:'dropoff', percent}` (DROP), `{type:'calendario'}`, `{type:'competencia'}` o `{type:'curso', course}`. Un `pin_screen` `curso:<slug>` solo vale si el curso existe, no está finalizado y no está oculto en `config.hidden_courses`; si no, se ignora (→ `null`). `key` identifica la pantalla mostrada, e incluye `drop_at` en el DROP (para repetir la animación).
    - `buildLeaderboard(live, courses, todayISO): { title, leader, others, more, recent }` — `leader = { name, points }` o `null`; `others` = hasta 6 de `{ rank, name, points, isRecent }` (rank 2..7); `more = max(0, players.length - 7)`; `recent = { name }` del jugador con `lastScoredAt` más reciente solo si `serverTime - lastScoredAt < 10000 ms`, si no `null`; `title` = nombre del curso con `startDate <= today <= endDate` (y no finalizado) o `null`.
    - `liveSignature(live, courses, todayISO): string` — cambia solo si cambia algo visible (estado, jugadores, quién es "reciente"); no incluye `serverTime` en bruto.
  - `js/rotation.js`: `buildScreens(courses, config, todayISO, live)` — si `live?.players.length > 0` agrega `{type:'competencia'}` después de las pantallas de cursos y antes del dropoff. Con 0 cursos próximos y jugadores sí puede salir la competencia.

- [ ] Tests primero (rojo), luego implementar (verde); incluir: normalización de basura, prioridad (DROP encima de fijo), curso fijado inexistente o finalizado, ventana de 10 s en los bordes (9.999 s vs 10 s), más de 7 jugadores, 0 jugadores, empates (orden recibido), `liveSignature` estable entre dos lecturas idénticas con distinto `serverTime`.
- [ ] Commit.

---

### Task 3: Pantalla de competencia y ciclo en vivo del TV

**Files:** Modify `js/render.js`, `tests/render.test.mjs`, `css/screens.css`, `js/main.js`

**Interfaces:**
- Consumes: Task 2 completo; `emptyScreen`, `esc`, helpers de `render.js`.
- Produces: `render.js` → `leaderboardScreen(model)` (`model` = salida de `buildLeaderboard`): HTML de la propuesta 3 (póster) portado de `propuestas/backoffice/l3-poster.dc.html` + bloque `.s3` de `tv-lb.css` con `/_blob/...` → `assets/...`; con `leader = null` muestra "Aún no hay participantes"; la fila `isRecent` va resaltada en borgoña; la cinta inferior "{nombre} acaba de sumar un punto" solo si `recent`.
- `main.js`: nuevo ciclo `liveLoop` (setTimeout encadenado cada 2 s, con `try/catch/finally` que SIEMPRE reprograma; ante un fallo conserva el último `state.live`). Tras cada lectura: `state.live = normalizeLive(raw)`; `resolveScreen(...)`; si el resultado tiene otra `key` que la mostrada → renderizar esa pantalla fija (cancelar el temporizador de rotación, ocultar la barra de progreso); si pasa de fijo a `null` → reanudar la rotación automática en el índice de la pantalla que estaba antes de fijar (usando `findScreenIndex`); si la pantalla visible es la competencia y cambió `liveSignature` → volver a dibujarla (solo entonces). La rotación automática incluye la competencia vía `buildScreens(..., live)`. Se conservan todos los comportamientos existentes (refresco de 5 min, caché, auto-lite, recuperación de pantalla única, relojes, `window.__tv`, que ahora expone también `liveRefresh` y `state.live`).

- [ ] Tests de `leaderboardScreen` (escape de nombres, líder, "+N más", resaltado, vacío), luego CSS y `main.js`; `node --check js/main.js`; verde.
- [ ] Commit.

---

### Task 4: App del teléfono (`/admin/`)

**Files:** Create `admin/index.html`, `admin/styles.css`, `admin/manifest.webmanifest`, `admin/icon-180.png`, `admin/icon-512.png`, `admin/vendor/supabase.js`, `admin/js/model.js`, `admin/js/api.js`, `admin/js/app.js`, `admin/dev.html`, `tests/admin-model.test.mjs`

**Interfaces:**
- Consumes: `normalizeLive`, `resolveScreen` no; usa `js/live.js` (`normalizeLive`), `js/pricing.js` (`buildPriceRows`, `formatPrice`, `applyDiscount`), `js/data.js` (`pickCourses`, `createClient`), `js/config.js`.
- Produces `admin/js/model.js` (puro): `screenButtons(courses, live)` → lista `{ id, label, sub, active }` para Calendario, un botón por curso próximo (`curso:<slug>`) y Competencia; `describeNow(live, courses)` → texto "Calendario (fijo)", "Automático", "DROP −30 % activo" etc.; `dropPreview(courses, percent)` → `{ lines: [{name,before,after}] (máx. 2), more: n }`; `playerRows(live)` → `{ id, rank, name, points }[]`; `DROP_PERCENTS = [10,20,30,40,50]`, `DEFAULT_DROP = 30`.
- `admin/js/api.js`: `createApi({ url, key })` con `signInEmail(email)` (`signInWithOtp`, `shouldCreateUser: false`), `verifyCode(email, token)` (`verifyOtp`, `type: 'email'`), `session()`, `signOut()`, `onAuth(cb)`, y las funciones RPC `pin(screen)`, `auto()`, `drop(percent)`, `dropOff()`, `addPlayer(name)`, `removePlayer(id)`, `score(id)`, `undo()`, `resetCompetition()`, más lecturas `live()` y `editions()` (anon). Mapea el error `forbidden` a un mensaje "Tu usuario no tiene permiso".
- `admin/js/app.js`: interfaz de las 4 pantallas de las maquetas (Entrar, Pantalla, DROP, Competencia) con pestañas inferiores, consulta de `live()` cada 2 s, toasts de error, "Nueva competencia" con confirmación (segundo toque en 3 s), estado de conexión visible. Todo texto de la base con `textContent` o `esc`.
- PWA: `manifest.webmanifest` (`name` "Control TV 0800", `short_name` "TV 0800", `display: standalone`, `start_url: /admin/`, colores `#050505`), `<link rel="apple-touch-icon">`, metas `apple-mobile-web-app-capable`, `viewport-fit=cover`. Íconos: logo blanco sobre fondo negro (generar con `sips`, p. ej. `sips -Z 130 ...` + `--padToHeightWidth`). `vendor/supabase.js`: archivo UMD oficial de `@supabase/supabase-js` v2 descargado de `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js` (anotar la versión y el sha256 en `admin/vendor/README.md`).
- `admin/dev.html`: carga la misma `app.js` con un `api` simulado en memoria (`?dev`), sin red, para verificar la interfaz.

- [ ] Tests del modelo primero (rojo → verde): botones y estado activo, texto de "ahora", vista previa de precios (2 líneas + "y N más"), filas de jugadores, valores por defecto.
- [ ] Implementar archivos, `node --check` de los módulos, verde.
- [ ] Commit.

---

### Task 5: Verificación y publicación (controlador)

- [ ] Revisión visual en el navegador: leaderboard con datos simulados (0, 1, 7 y 12 jugadores, con y sin "reciente"); `admin/dev.html` a 390×844 en las 4 pantallas.
- [ ] Prueba de extremo a extremo contra la base real con un usuario de pruebas simulado vía SQL: el TV local cambia al fijar/DROP/puntuar (llamando a las funciones con `execute_sql` dentro de una transacción confirmada y revirtiendo después, o con el TV apuntando a una copia); confirmar que el estado de producción queda limpio (`mode auto`, sin jugadores, sin DROP).
- [ ] Revisión final del código (modelo más capaz) y una pasada única de correcciones.
- [ ] Pedir a David el "sí" para `git push` y entregarle los pasos de instalación en el iPhone.
