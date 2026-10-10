# TV 0800

Pantallas para los televisores de 0800, en vivo desde el Supabase de 0800 HUB.

## Abrir en el TV

Abrir la URL del sitio (Vercel) en el navegador del TV en pantalla completa.

- `?lite` fuerza el modo sin animaciones (se activa solo si el TV va lento).

## Pantallas

1. **Anuncio libre** (tiquete): solo si hay un título en `announcement_title`. Va primero.
2. **Calendario** (stickers): el mes con las fechas de las próximas ediciones y los 3 próximos cursos.
3. **Un curso por pantalla** (tiquete blanco): fecha, cuenta regresiva, cupos. Solo cursos con edición próxima.
4. **Dropoff de precio** (recibo): todos los cursos con el descuento aplicado. Va último y solo si está activo.

Los cursos que ya no tienen fecha futura no tienen pantalla propia. El TV consulta cada 5 minutos y, si falla la red, usa lo último guardado y enciende un punto borgoña abajo a la izquierda.

## Control desde tu app (tabla `tv_config`, fila `id = 1`)

La lectura es pública; escribir requiere un rol con permisos de escritura (service role).

| Campo | Tipo | Qué hace |
|---|---|---|
| `screens` | json | Qué pantallas de curso entran: `["calendario","cursos"]` |
| `seconds_per_screen` | entero 3 a 120 | Segundos por pantalla |
| `hidden_courses` | lista de slugs | Cursos que no se muestran (tampoco en el dropoff) |
| `message` | texto | Texto del pie de las pantallas con marco |
| `discount_active` | sí/no | Activa el dropoff de precio |
| `discount_percent` | entero 0 a 90 | Descuento para todos los cursos |
| `announcement_title` | texto | Titular del anuncio (vacío = sin anuncio) |
| `announcement_note` | texto | Línea pequeña bajo el titular |
| `announcement_date` | fecha | Fecha grande del talón (vacía = tiquete sin talón) |

Ejemplo, activar el dropoff al 30 %:

    update tv_config set discount_active = true, discount_percent = 30 where id = 1;

## Control desde el teléfono (/admin)

App web para iPhone en `https://tv-0800.vercel.app/admin/`. Instalar: abrir en Safari → Compartir → Añadir a pantalla de inicio.

- **Entrar:** escribes tu correo del Hub, te llega un código de 6 dígitos y lo tecleas. Solo entran administradores del Hub (la función `is_admin()` del propio Hub).
- **Pantalla:** fija el calendario, un curso o la competencia en el TV; "Volver a automático" reanuda la rotación.
- **DROP:** eliges 10/20/30/40/50 % y pulsas DROP; el TV muestra el recibo con los precios cayendo. "Quitar descuento" lo apaga y el TV vuelve a lo que estaba.
- **Competencia:** agregas nombres, tocas +1 por respuesta correcta, deshaces, y "Nueva competencia" borra todo. El TV muestra el leaderboard en vivo.

El TV consulta `tv_live()` cada 2 segundos. Prioridad en el TV: DROP activo > pantalla fija > rotación automática.

**Requisito de Supabase:** en el panel (Authentication → Emails → plantilla *Magic Link*) el cuerpo debe incluir `{{ .Token }}` para que el correo traiga el código de 6 dígitos.

## Miniaturas y logo

- Miniaturas: `assets/cursos/<slug>.jpg`, 16:9 de 1280 px, con el `slug` de `vta_courses.slug`. Sin miniatura se muestra el nombre del curso.
- Logo: `assets/logo-0800.png` (tinta) y `assets/logo-0800-blanco.png` (blanco).

## Datos

- `sql/001` a `004`: función `tv_ediciones()` (solo lectura para `anon`: curso, fechas, ciudad, lugar, cupos y precio base) y tabla `tv_config`.
- Los precios finales se calculan en el TV: `round(precio_base × (100 − %))` en centavos.

## Desarrollo

    npm test         # pruebas de la lógica (Node >= 18)
    npm run serve    # http://localhost:8080

`propuestas/` guarda las maquetas de diseño (incluida `propuestas/lienzo/`).
