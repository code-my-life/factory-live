// Construit le site de factory-live dans site/dist : les pages anglaise et française, leurs styles
// (jetons de Primer et police Mona Sans embarqués, aucun CDN) et, sous demo/, la vraie app sur le
// scénario de démonstration, relocalisable (chemins relatifs), sans service worker ni manifeste.
//   node site/build.mjs [--out site/dist] [--no-demo]
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import en from './src/content/en.mjs';
import fr from './src/content/fr.mjs';
import { renderPage } from './src/page.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'site/src');
const require = createRequire(import.meta.url);

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: 'site/dist' },
    'no-demo': { type: 'boolean', default: false },
  },
});
const OUT = resolve(ROOT, values.out);

/** Les jetons de Primer, comme l'app les importe : tailles, typographie, mouvement, thème sombre. */
function primerTokens() {
  const base = dirname(require.resolve('@primer/primitives/dist/css/primitives.css'));
  const index = readFileSync(join(base, 'primitives.css'), 'utf8');
  const files = [...index.matchAll(/@import '([^']+)';/g)].map((match) => join(base, match[1]));
  files.push(join(base, 'functional/themes/dark.css'));
  return files
    .map((file) => readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''))
    .join('\n')
    .replace(/\n\s*\n/g, '\n');
}

/** Mona Sans (OFL), la première police de la pile de Primer, en sous-ensembles latin et latin étendu. */
const FONT_FILES = ['mona-sans-latin-wght-normal.woff2', 'mona-sans-latin-ext-wght-normal.woff2'];

function fontFaces() {
  const css = readFileSync(require.resolve('@fontsource-variable/mona-sans/wght.css'), 'utf8');
  const blocks = css
    .split('@font-face')
    .filter((block) => FONT_FILES.some((file) => block.includes(`files/${file}`)));
  if (blocks.length !== FONT_FILES.length)
    throw new Error('Mona Sans : sous-ensembles introuvables');
  return blocks
    .map((block) =>
      `@font-face${block}`
        .replace(/font-family: '[^']+'/, "font-family: 'Mona Sans VF'")
        .replace(/url\(\.\/files\//, 'url(fonts/')
        .replace("format('woff2-variations')", "format('woff2')")
        .replace(/\s*\/\*[^*]*\*\/\s*$/, '')
        .trim(),
    )
    .join('\n');
}

/** Taille en pixels d'une image WebP (VP8, VP8L, VP8X) ou PNG, lue dans son en-tête. */
function imageSize(buffer) {
  if (buffer.toString('ascii', 1, 4) === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('Image ni PNG ni WebP');
  }
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  }
  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  if (chunk === 'VP8 ') {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  throw new Error(`WebP inconnu : ${chunk}`);
}

function buildDemo() {
  const result = spawnSync(
    'npm',
    ['run', 'build', '-w', '@factory-live/web', '--', '--emptyOutDir'],
    {
      cwd: ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        VITE_DATA_SOURCE: 'demo',
        // Routeur en mémoire : la vue s'ouvre par `#jeton` (demo/#interventions), sans réécriture
        // d'adresse que GitHub Pages ne sait pas faire.
        VITE_ROUTER: 'memory',
        FACTORY_LIVE_BASE: './',
        FACTORY_LIVE_PWA: '0',
        FACTORY_LIVE_SOURCEMAP: '0',
        FACTORY_LIVE_OUT_DIR: join(OUT, 'demo'),
      },
    },
  );
  if (result.status !== 0) throw new Error('Build de la démo en échec');
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'assets/fonts'), { recursive: true });
mkdirSync(join(OUT, 'fr'), { recursive: true });

if (!values['no-demo']) buildDemo();

/** Les captures de chaque langue, dans img/<langue>/, avec leur taille en pixels. */
function imagesOf(lang) {
  return Object.fromEntries(
    readdirSync(join(SRC, 'img', lang)).map((name) => [
      name,
      imageSize(readFileSync(join(SRC, 'img', lang, name))),
    ]),
  );
}
const images = { en: imagesOf('en'), fr: imagesOf('fr') };
const pages = [
  {
    file: 'index.html',
    content: en,
    page: {
      path: '',
      root: '',
      lang: 'en',
      otherLang: 'fr',
      otherPath: 'fr/',
      otherHref: 'fr/',
      images: images.en,
    },
  },
  {
    file: 'fr/index.html',
    content: fr,
    page: {
      path: 'fr/',
      root: '../',
      lang: 'fr',
      otherLang: 'en',
      otherPath: '',
      otherHref: '../',
      images: images.fr,
    },
  },
];
for (const { file, content, page } of pages) {
  writeFileSync(join(OUT, file), renderPage(content, page));
}

writeFileSync(
  join(OUT, 'assets/site.css'),
  [
    primerTokens(),
    fontFaces(),
    readFileSync(join(SRC, 'reset.css'), 'utf8'),
    readFileSync(join(SRC, 'site.css'), 'utf8'),
  ].join('\n'),
);
cpSync(join(SRC, 'site.js'), join(OUT, 'assets/site.js'));
for (const file of FONT_FILES) {
  cpSync(
    require.resolve(`@fontsource-variable/mona-sans/files/${file}`),
    join(OUT, 'assets/fonts', file),
  );
}
cpSync(
  require.resolve('@fontsource-variable/mona-sans/LICENSE'),
  join(OUT, 'assets/fonts/LICENSE.txt'),
);
cpSync(join(SRC, 'img'), join(OUT, 'assets/img'), { recursive: true });
cpSync(join(ROOT, 'apps/web/public/icons/icon.svg'), join(OUT, 'favicon.svg'));

const demo = existsSync(join(OUT, 'demo/index.html')) ? ', démo' : ', sans la démo';
console.log(
  `Site construit dans ${OUT} : 2 pages, ${Object.keys(images.en).length} images par langue${demo}.`,
);
