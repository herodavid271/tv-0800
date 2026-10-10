# Back office TV 0800: control remoto y competencia

Fecha: 2026-10-10 · Estado: diseño aprobado en conversación, pendiente de revisión del documento

## Objetivo

David da clases con PowerPoint en su Mac y tiene el TV (sitio `tv-0800.vercel.app`) a pantalla completa en otra pantalla para el público. Desde su iPhone necesita:

1. **Fijar lo que ve el TV** (por ejemplo el calendario durante un receso, o un curso mientras habla de él) y volver al modo automático.
2. **Botón DROP**: en el cierre del curso, mostrar en el momento exacto el recibo con todos los cursos con descuento, eligiendo el porcentaje.
3. **Competencia**: registrar nombres de participantes y sumar +1 por respuesta correcta; el TV muestra el leaderboard en vivo.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| App del teléfono | Web instalable (PWA) en `/admin/` del mismo repo y Vercel. iPhone: Safari → Compartir → Añadir a pantalla de inicio |
| Acceso | Cuenta del Hub (Supabase Auth, mismo proyecto). Inicio de sesión con **código de 6 dígitos por correo** (el login con Google no funciona bien en una app instalada en iPhone). Solo rol "Acceso completo" |
| Conexión TV ↔ teléfono | El TV consulta `tv_live()` cada 2 s (sin WebSocket ni librerías). Latencia esperada 1 a 3 s |
| Escritura | Solo mediante funciones de base de datos que verifican sesión y rol. Las tablas no tienen permisos de escritura públicos |
| DROP | Chips 10/20/30/40/50 % antes de pulsar; botón grande; botón para quitarlo |
| Competencia | Nombres escritos a mano, +1 por toque con deshacer (varios niveles), se borra al iniciar una nueva competencia; no se guarda historial |
| Leaderboard en el TV | Propuesta 3 (póster): el "1" gigante en amarillo con el líder y panel negro con los demás |
| Anuncio desde el teléfono | Fuera de esta entrega. La pantalla de anuncio del TV sigue controlada por `tv_config` |

## Arquitectura

```
iPhone (admin/)  --RPC con sesión-->  Supabase (tv_live_state, tv_players, tv_score_events)
                                              ^
TV (index.html) --RPC anon tv_live() cada 2 s-+
```

### Datos (migración 004)

- `tv_live_state` (una fila, `id = 1`): `mode` (`auto` | `pin`), `pin_screen` (`calendario` | `curso:<slug>` | `competencia` | null), `drop_active`, `drop_percent` (0 a 90), `drop_at` (momento en que se pulsó DROP), `updated_at`.
- `tv_players`: `id`, `name` (1 a 24 caracteres), `points`, `created_at`, `last_scored_at`.
- `tv_score_events`: `id`, `player_id` (con borrado en cascada), `created_at`. Un registro por punto, para deshacer varias veces.
- RLS activo en las tres, sin políticas: nadie accede directamente; todo pasa por funciones `security definer` con `search_path` fijo.

### Funciones

- **Lectura (rol `anon`)**: `tv_live()` devuelve JSON con `state`, `players` ordenados por puntos descendente y, a igualdad, por quién llegó primero a esos puntos, y `server_time` (el TV usa la hora del servidor para decidir si un punto es reciente, sin depender de su propio reloj).
- **Escritura (rol `authenticated`, todas fallan con `forbidden` si `tv_is_admin()` es falso)**: `tv_pin(screen)`, `tv_auto()`, `tv_drop(percent)` (1 a 90), `tv_drop_off()`, `tv_player_add(name)`, `tv_player_remove(id)`, `tv_score(player_id)`, `tv_undo()`, `tv_competition_reset()`.
- La autorización reutiliza `public.is_admin()`, la regla de administrador que ya usa el Hub (perfil con rol `admin` o con un rol de acceso completo a todas las áreas). Hoy son 3 usuarios; dar acceso a otra persona es darle ese rol en el Hub. Una función interna `tv_assert_admin()` la llama y rechaza con `forbidden` si no hay sesión o no cumple.

## Comportamiento del TV

Nuevo módulo `js/live.js` (consulta cada 2 s, conserva el último estado si falla) y un resolvedor puro que decide qué mostrar. Prioridad:

1. **DROP activo** → pantalla de dropoff con `drop_percent`. La animación se repite cada vez que cambia `drop_at`. Al quitarlo vuelve a lo que estaba.
2. **Modo fijo** → la pantalla fijada, sin rotar y sin barra de progreso. Si el curso fijado ya no existe, vuelve a auto.
3. **Modo auto** → la rotación de hoy (anuncio, calendario, cursos, dropoff por `tv_config`) y, si hay participantes, la competencia después de los cursos.

**Pantalla de competencia** (propuesta 3 del lienzo): "1" gigante, nombre y puntos del líder; panel con los lugares 2 a 7 (si hay más, "+N más"); cinta inferior "X acaba de sumar un punto" y fila resaltada en borgoña solo si el último punto fue hace menos de 10 s (hora del servidor). Con 0 participantes: "Aún no hay participantes". El título muestra el curso de hoy si hay uno en curso o que empieza hoy. Solo se vuelve a dibujar cuando cambian los datos (no en cada consulta) para no reiniciar las animaciones.

## App del teléfono (`admin/`)

- Archivos: `index.html`, `app.js`, `styles.css`, `manifest.webmanifest`, íconos, y `vendor/supabase.js` (cliente oficial, fijado a una versión, sin CDN).
- **Entrar**: correo → "Enviar código" → 6 dígitos → "Entrar". La sesión se guarda y se renueva sola. Si caduca, vuelve a Entrar.
- **Pestaña Pantalla**: tarjeta "Ahora en el TV", botones Calendario, un botón por curso próximo y Competencia; el activo en amarillo; "Volver a automático".
- **Pestaña DROP**: chips de %, botón DROP (cambia a borgoña "activo" mientras está encendido), vista previa de 2 precios y "Quitar descuento del TV".
- **Pestaña Competencia**: campo de nombre + Agregar, lista con +1 grande, "Deshacer último", "Nueva competencia" (pide confirmación), aviso del último punto con "Deshacer".
- La app también consulta `tv_live()` cada 2 s para mostrar el estado real y mantenerse sincronizada.
- Objetivos táctiles de 44 px o más; estado de conexión visible; si una acción falla, aviso "No se pudo, reintenta" sin perder lo escrito.

## Errores y casos límite

- Pérdida de red en el TV: sigue con el último estado conocido; el punto "sin conexión" ya existente indica el fallo de datos generales.
- Pérdida de red en el teléfono: las acciones fallan con aviso; nunca se aplican a medias.
- Dos dispositivos a la vez: gana la última escritura; ambos se sincronizan en 2 s.
- Nombres repetidos permitidos (dos "Ana"); se distinguen por la fila.
- Si `drop_active` está encendido pero no hay cursos con precio, el TV ignora el DROP y sigue.
- Usuario con sesión pero sin rol: las funciones devuelven `forbidden` y la app muestra "Tu usuario no tiene permiso".

## Pruebas

- SQL: casos con `set local role` y claims simulados (sin sesión, con sesión sin rol, con rol): lectura anónima ok, escritura anónima y sin rol rechazada, `tv_undo` en varios niveles, orden y desempate, reset en cascada.
- JS (`node --test`): resolvedor de pantalla (prioridades, curso inexistente, DROP encima de fijo), modelo del leaderboard (orden, empates, top 7 y "+N más", ventana de 10 s), consulta con fallo.
- Teléfono: pruebas del modelo y de la lógica de sesión; verificación visual en navegador con un cliente simulado (`admin/dev.html`, no se despliega con datos reales); comprobación final por David en su iPhone.

## Fuera de alcance

Anuncio desde el teléfono, receso con cuenta regresiva, historial de competencias, lista de inscritos del Hub, varias competencias a la vez, notificaciones, Realtime/WebSocket.
