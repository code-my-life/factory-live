// Serveur statique du site : prévisualisation, tests et captures. Sert un dossier sous un chemin de
// base, comme GitHub Pages sert le site sous /factory-live/.
//   node site/serve.mjs [--root site/dist] [--port 4195] [--base /factory-live/]
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

async function fileAt(path) {
  try {
    const info = await stat(path);
    if (info.isFile()) return path;
    if (info.isDirectory()) {
      const index = join(path, 'index.html');
      return (await stat(index)).isFile() ? index : null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Sert `root` sous `base`. Avec `spa`, une adresse sans fichier renvoie l'index.html de la racine
 * (application à routeur navigateur, pour les captures).
 * @param {{ root: string, port?: number, host?: string, base?: string, spa?: boolean }} options
 * @returns {Promise<{ server: import('node:http').Server, url: string }>}
 */
export function serve({ root, port = 0, host = '127.0.0.1', base = '/', spa = false }) {
  const rootDir = resolve(root);
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      let pathname;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        response.writeHead(400).end();
        return;
      }
      if (`${pathname}/` === prefix || (pathname === '/' && prefix !== '/')) {
        response.writeHead(301, { location: prefix + url.search }).end();
        return;
      }
      if (!pathname.startsWith(prefix)) {
        response.writeHead(404, { 'content-type': TYPES['.txt'] }).end('Not found');
        return;
      }
      const target = resolve(rootDir, `.${pathname.slice(prefix.length - 1)}`);
      if (target !== rootDir && !target.startsWith(rootDir + sep)) {
        response.writeHead(403).end();
        return;
      }
      if (
        pathname.endsWith('/') === false &&
        (await stat(target).catch(() => null))?.isDirectory()
      ) {
        response.writeHead(301, { location: `${pathname}/${url.search}` }).end();
        return;
      }
      let file = await fileAt(target);
      if (!file && spa && !extname(pathname)) file = await fileAt(join(rootDir, 'index.html'));
      if (!file) {
        response.writeHead(404, { 'content-type': TYPES['.txt'] }).end('Not found');
        return;
      }
      response.writeHead(200, {
        'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      createReadStream(file).pipe(response);
    })();
  });
  return new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      done({ server, url: `http://${host}:${actualPort}${prefix}` });
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      root: { type: 'string', default: 'site/dist' },
      port: { type: 'string', default: '4195' },
      host: { type: 'string', default: '127.0.0.1' },
      base: { type: 'string', default: '/factory-live/' },
    },
  });
  const { url } = await serve({
    root: values.root,
    port: Number(values.port),
    host: values.host,
    base: values.base,
  });
  console.log(`Site servi sur ${url}`);
}
