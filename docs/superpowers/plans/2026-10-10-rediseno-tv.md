# Rediseño TV 0800 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Llevar a producción las pantallas elegidas por David: calendario C (sticker), curso B (tablero con tiquete blanco), dropoff de precio (recibo) y anuncio libre (tiquete), con datos reales y controladas desde `tv_config`. La pantalla de resumen se elimina.

**Architecture:** Mismo sitio estático (HTML/CSS/JS ES modules, Node `node:test`). La lógica pura (precios, rotación) vive en módulos probados; `render.js` genera el HTML de cada pantalla y `css/screens.css` lleva los estilos portados de las maquetas aprobadas en `propuestas/lienzo/`. Cada pantalla trae su propio marco (ya no hay cabecera/pie global); `main.js` solo rota, refresca y muestra la barra de progreso y el punto de "sin conexión".

**Tech Stack:** HTML5, CSS (solo `transform`/`opacity` animados), JS ES modules, Supabase (REST/RPC), Node ≥ 18 para pruebas.

## Global Constraints

- Maquetas aprobadas (fuente visual EXACTA, portar sin rediseñar): `propuestas/lienzo/tv-c.css` + `c-calendario.dc.html` (calendario), `propuestas/lienzo/tv-b.css` + `b-curso.dc.html` (curso, con tiquete BLANCO `#fff`), `propuestas/lienzo/tv-d.css` + `d-recibo.dc.html` (dropoff), `propuestas/lienzo/tv-m.css` + `m-tiquete.dc.html` (anuncio), base `propuestas/lienzo/tv-canvas.css`. Los `/_blob/...` de las maquetas se sustituyen por `assets/...` (logo tinta `assets/logo-0800.png`, logo blanco `assets/logo-0800-blanco.png`, fuente `assets/fonts/CreatoDisplay-Black.otf`, miniaturas `assets/cursos/<slug>.jpg`).
- Lienzo fijo 1920×1080 escalado a la ventana. Solo se animan `transform` y `opacity`. `?lite` / auto-lite (clase `lite` en `<html>`) eliminan toda animación salvo la barra de progreso; `prefers-reduced-motion` igual.
- Identidad: amarillo `#FFE200`, borgoña `#A3243B`, tinta `#0E0E0E`, papel `#EFEFEA`, fondo oscuro `#050505`; titulares/cifras en Creato Display Black; sin degradados ni blur.
- Precios: `precio_final = round(precio_base * (100 - porcentaje)) / 100` (centavos); formato `$41.99` con separador de miles (`$1,120.00`).
- El dropoff solo entra en la rotación si `config.discount_active === true` Y `config.discount_percent` entre 1 y 90 Y hay al menos un curso (próximo o finalizado) con `basePrice > 0` y no oculto. El anuncio solo si `config.announcement_title` no está vacío. El anuncio va PRIMERO en la rotación; el dropoff, ÚLTIMO.
- Si no hay ninguna pantalla que mostrar: pantalla "Próximamente" (`vacio`).
- Todo texto de la base se inserta con `esc()`. Nada de `innerHTML` con datos sin escapar.
- Tests: `npm test` debe terminar en verde. Commits terminan con `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (exactamente ese nombre).

## File Structure

```
sql/003_tv_dropoff_anuncio.sql    base_price en tv_ediciones + campos nuevos en tv_config
js/pricing.js                     applyDiscount, formatPrice, buildPriceRows
js/data.js                        (modifica) basePrice, config nueva
js/rotation.js                    (modifica) sin resumen; anuncio y dropoff
js/render.js                      (reescribe) flap, calendario C, curso B, dropoff, anuncio, vacio
css/screens.css                   (nuevo) estilos portados de las maquetas
css/{tokens,layout,anim}.css      (se eliminan)
index.html, js/main.js            (modifican) marco mínimo
tests/pricing.test.mjs  data.test.mjs  rotation.test.mjs  render.test.mjs
```

---

### Task 1: Migración SQL (controlador, producción)

**Files:** Create `sql/003_tv_dropoff_anuncio.sql`

**Interfaces:**
- Produces: `tv_ediciones()` devuelve además `base_price numeric` (última columna). `tv_config` gana `discount_active boolean not null default false`, `discount_percent int not null default 0 check (discount_percent between 0 and 90)`, `announcement_title text`, `announcement_note text`, `announcement_date date`; `screens` por defecto y en la fila 1 pasa a `["calendario","cursos"]`.

- [ ] Escribir el SQL (drop + create de la función con `base_price`, `grant execute` a `anon, authenticated`; `alter table ... add column if not exists`).
- [ ] Mostrar a David y esperar "sí"; aplicar con `apply_migration`.
- [ ] Probar como `anon`: `select course_slug, base_price from tv_ediciones()` devuelve precios (p. ej. 99.99 para `delega-con-ia`); `curl PATCH` a `tv_config` sigue dando 401.
- [ ] Commit.

---

### Task 2: Datos y precios

**Files:** Create `js/pricing.js`, `tests/pricing.test.mjs`; Modify `js/data.js`, `tests/data.test.mjs`

**Interfaces:**
- Produces:
  - `Course` gana `basePrice: number | null` (`Number(r.base_price)`, `null` si falta).
  - `DEFAULT_CONFIG = { screens: ['calendario','cursos'], seconds_per_screen: 12, hidden_courses: [], message: null, discount_active: false, discount_percent: 0, announcement_title: null, announcement_note: null, announcement_date: null }`.
  - `normalizeConfig`: `discount_active` solo `true` si es `=== true`; `discount_percent` entero 0..90 (otro valor → 0); `announcement_*` string recortado, vacío → `null`; `announcement_date` solo si coincide `^\d{4}-\d{2}-\d{2}$`, si no `null`.
  - `applyDiscount(price: number, percent: number): number` (centavos, ver Global Constraints).
  - `formatPrice(n: number): string`.
  - `buildPriceRows(courses, percent): Array<{ slug, name, before: number, after: number, saving: number }>` con TODOS los cursos con `basePrice > 0` (también los de edición finalizada, porque el dropoff muestra el catálogo completo), en el mismo orden de entrada (próximos primero, finalizados después); `saving = round((before - after) * 100) / 100`.

- [ ] Tests primero (rojo): precios 59.99→41.99, 79.99→55.99, 99.99→69.99, 393.99→275.79 al 30 %; `formatPrice(1120)` → `$1,120.00`; filas incluyen finalizados y excluyen solo los sin precio (null o 0); `normalizeConfig` de los campos nuevos (porcentaje 150 → 0, `'  Hola '` → `'Hola'`, `''` → `null`, fecha inválida → `null`); `pickCourses` expone `basePrice`.
- [ ] Implementar, verde, commit.

---

### Task 3: Rotación

**Files:** Modify `js/rotation.js`, `tests/rotation.test.mjs`

**Interfaces:**
- Consumes: `buildPriceRows` de Task 2.
- Produces: `buildScreens(courses, config, todayISO): Screen[]` con `Screen = {type:'anuncio'} | {type:'calendario'} | {type:'curso', course} | {type:'dropoff', percent:number} | {type:'vacio'}`. Se elimina `resumen`. Orden: anuncio (si aplica) → pantallas de `config.screens` (`calendario`, `cursos`; nombres desconocidos, incluido `resumen`, se ignoran) → dropoff (si aplica). Si no hay cursos próximos NO se generan `calendario`/`curso`, pero el anuncio y el dropoff sí pueden salir. Si el resultado es vacío → `[{type:'vacio'}]`. Los cursos siguen ordenados: hoy/mañana/en curso primero, luego por fecha; los finalizados no tienen pantalla.

- [ ] Actualizar tests (rojo→verde): sin resumen, anuncio primero, dropoff último y solo con flag+porcentaje válido+algún curso (también finalizado) con precio y no oculto; el dropoff puede salir aunque no haya cursos próximos, y el anuncio también, `vacio`.
- [ ] Commit.

---

### Task 4: Pantallas (render, CSS, marco, main)

**Files:** Rewrite `js/render.js`, `tests/render.test.mjs`; Create `css/screens.css`; Modify `index.html`, `js/main.js`; Delete `css/tokens.css`, `css/layout.css`, `css/anim.css`

**Interfaces:**
- Consumes: `Course`, `Config` (Task 2), `Screen` (Task 3), `daysUntil`, `badgeFor`, `seatState` (existentes), `buildMonthGrid`/`monthToShow` (existentes), `buildPriceRows`/`formatPrice` (Task 2).
- Produces en `render.js`: `esc`, `flap(text, cls = '')`, `calendarScreen(courses, todayISO)`, `courseScreen(course, todayISO, opts = {})` (`opts.message` reemplaza "En vivo desde 0800 Hub" en el pie), `dropoffScreen(courses, percent, todayISO)`, `announcementScreen(config, todayISO)`, `emptyScreen(text)`. `flap('09:13')` → `<span class="fl"><i>0</i><i>9</i><i>:</i><i>1</i><i>3</i></span>` (espacios → `<i class="sp">&nbsp;</i>`, todo escapado, `cls` se agrega a `class`). Los relojes llevan `data-clock`.

Comportamiento por pantalla (portar el HTML/CSS de las maquetas y llenar con datos reales):
- **Calendario (C):** mes de `monthToShow`, días marcados con sticker amarillo rotado (`--r` alternando -9/7/-5 grados), círculo borgoña en hoy, lista "Lo que viene" con miniatura + fecha larga + "Faltan N días" (o "Hoy"/"Mañana"/"En curso"), máximo 3 filas (los 3 próximos).
- **Curso (B, tiquete blanco):** cabecera con logo blanco y reloj en flaps; tiquete blanco con miniatura (`nothumb` si falta), nombre, "Cupos disponibles X de T" (`AGOTADO` si agotado), talón con "Jueves / 15 de oct", cuenta regresiva en flaps (`05` días; si `days <= 1` o en curso, reemplazar por flaps con `HOY` / `MAÑANA` / `EN CURSO`), código de barras decorativo.
- **Dropoff:** recibo blanco que se imprime con una fila por curso del catálogo (`buildPriceRows`, hasta 8 filas; reducir el alto de fila si hace falta para que quepan sin desbordar los 1080 px), precio base tachado y precio final, total "Descuento aplicado −N%", y a la derecha `−N%` gigante cayendo.
- **Anuncio (tiquete):** título (`announcement_title`), nota (`announcement_note`, omitir si es null), talón con día y mes de `announcement_date` (omitir talón si es null; el tiquete ocupa todo el ancho).
- **Vacío:** "Próximamente" / "Conectando…" sobre fondo oscuro con el logo blanco.
- **`index.html`/`main.js`:** `#stage` 1920×1080 con `#host`, `#progress` (barra amarilla abajo) y `#dot` (punto borgoña "sin conexión"). Sin cabecera, pie ni tema (se elimina `?tema=`); `?lite` se mantiene. `main.js` renderiza cada `Screen`, actualiza los `[data-clock]` cada 10 s caracter a caracter, y conserva todo el comportamiento de refresco, caché, auto-lite y recuperación de pantalla única que ya existe.

- [ ] Tests de render primero (rojo): `flap`, escape de HTML en nombres/títulos, calendario con 3 stickers, curso (cupos, `AGOTADO`, `HOY`, `nothumb` onerror), dropoff (precios tachado/final, `-30%`), anuncio con y sin fecha, vacío.
- [ ] Implementar `render.js`, `css/screens.css` (portado), `index.html`, `main.js`; verde.
- [ ] Commit.

---

### Task 5: Verificación visual (controlador)

- [ ] Servir local y revisar a 1920×1080 cada pantalla con datos reales; forzar `discount_active` y `announcement_*` inyectando `window.__tv.state.config` para ver dropoff y anuncio; probar `?lite` y sin conexión.
- [ ] Revisión final de rama (modelo más capaz), correcciones en una sola pasada.
- [ ] Pedir a David la autorización para `git push` (despliega en Vercel).
