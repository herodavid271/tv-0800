# TV 0800

Pantallas para los televisores de 0800: calendario animado y próxima fecha de cada curso presencial, en vivo desde el Supabase de 0800 HUB.

## Abrir en el TV

Abrir la URL de GitHub Pages en el navegador del TV en pantalla completa.

- `?tema=claro` cambia al tema claro (por defecto es oscuro).
- `?lite` fuerza el modo sin animaciones (se activa solo si el TV va lento).

## Qué se muestra

- **Calendario del mes** con las fechas de las próximas ediciones marcadas en amarillo.
- **Una pantalla por curso** con fecha, días que faltan y cupos disponibles.
- **Resumen** de todos los cursos; los que ya no tienen fecha futura salen atenuados como "Finalizado" (solo aquí).

Las fechas salen de la próxima edición de cada curso presencial. El TV consulta cada 5 minutos y, si falla la red, usa lo último guardado en el navegador y enciende un punto borgoña abajo a la derecha.

## Miniaturas

Una imagen 16:9 de 1280 px de ancho por curso en `assets/cursos/<slug>.jpg`, con el `slug` de `vta_courses.slug`. Sin miniatura se muestra una tarjeta con el nombre del curso.

## Logo

`assets/logo-0800.png`. Sin él se muestra "0800" en una etiqueta amarilla.

## Datos y app de control

- `sql/001_tv_ediciones.sql`: función `tv_ediciones()`, solo lectura, para el rol `anon`. Expone únicamente curso, fechas, ciudad, lugar y cupos.
- `sql/002_tv_config.sql`: tabla `tv_config` de una sola fila (`id = 1`), de lectura pública. La app de control escribe aquí con un rol con permisos de escritura:
  - `screens`: orden de pantallas (`calendario`, `cursos`, `resumen`).
  - `seconds_per_screen`: segundos por pantalla (3 a 120).
  - `hidden_courses`: slugs de cursos a ocultar.
  - `message`: texto que se muestra abajo, junto al logo.

## Desarrollo

    npm test         # pruebas de la lógica (Node >= 18)
    npm run serve    # http://localhost:8080
