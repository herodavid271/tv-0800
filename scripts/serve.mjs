import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT) || 8080;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.otf': 'font/otf',
  '.json': 'application/json',
};

// Solo desarrollo: las mesas de propuestas/lienzo usan las rutas /_blob/ del lienzo publicado.
const blobs = {
  '4cb5b49774320637fb24a8344a31297c': '/assets/fonts/CreatoDisplay-Black.otf',
  '030522e9f223002d8b713edbd7759bbd': '/assets/logo-0800.png',
  '6952ffa2404730332f97b37b2425b568': '/assets/logo-0800-blanco.png',
  ac978db198fa5acfab2888ad32970c42: '/assets/cursos/delega-con-ia.jpg',
  '803317ed555bcc08eb5b63ca3c846827': '/assets/cursos/laboratorio-de-ads.jpg',
  '49b948dac5efaeb67d40aa438b4c3334': '/assets/cursos/estrategias-de-marketing-360.jpg',
  bcd113efa7fd678fc182ee605fcde2e2: '/assets/cursos/ventas-automatizadas.jpg',
  ddf658a625b5172e931c728d8c3537b9: '/assets/cursos/manejo-de-redes.jpg',
};

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.startsWith('/_blob/')) path = blobs[path.slice(7)] ?? path;
  const file = normalize(join(root, path.endsWith('/') ? `${path}index.html` : path));
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('no encontrado');
  }
}).listen(port, () => console.log(`TV 0800 en http://localhost:${port}`));
