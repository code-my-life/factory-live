// Structure du site construit (site/dist) : deux langues jumelles, liens et ancres qui mènent
// quelque part, aucune ressource hors du site, la démo relocalisable et sans service worker.
//   node site/build.mjs && node --test site/test/
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';

const ROOT = resolve(import.meta.dirname, '../..');
const DIST = join(ROOT, 'site/dist');
const SITE_URL = 'https://code-my-life.github.io/factory-live/';
const PAGES = [
  { file: 'index.html', lang: 'en', other: { lang: 'fr', href: 'fr/' } },
  { file: 'fr/index.html', lang: 'fr', other: { lang: 'en', href: '../' } },
];
const SECTIONS = ['top', 'screens', 'see', 'how', 'start', 'security', 'roadmap'];
const EM_DASH = String.fromCharCode(0x2014);

const read = (file) => readFileSync(join(DIST, file), 'utf8');
const ids = (html) => [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const attributes = (html, name) =>
  [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, 'g'))].map((match) => match[1]);

/** Les vues que la démo ouvre par `#jeton` (routeur en mémoire), lues dans le code de l'app. */
function demoTokens() {
  const router = readFileSync(join(ROOT, 'apps/web/src/app/router.tsx'), 'utf8');
  const block = router.match(/VIEW_TOKENS[^{]*\{([^}]*)\}/);
  assert.ok(block, 'VIEW_TOKENS introuvable dans le routeur de l’app');
  return [...block[1].matchAll(/(\w+):/g)].map((match) => match[1]);
}

/** Le fichier servi pour une adresse relative à une page (dossier → index.html). */
function target(pageFile, url) {
  const path = url.split('#')[0].split('?')[0];
  const file = resolve(dirname(join(DIST, pageFile)), path || '.');
  if (existsSync(file) && statSync(file).isDirectory()) return join(file, 'index.html');
  return file;
}

test('le site est construit : deux pages, la démo, les styles et le script', () => {
  for (const file of [
    'index.html',
    'fr/index.html',
    'demo/index.html',
    'assets/site.css',
    'assets/site.js',
    'favicon.svg',
  ]) {
    assert.ok(existsSync(join(DIST, file)), `${file} manque : lancer node site/build.mjs`);
  }
});

for (const page of PAGES) {
  test(`${page.file} : langue, titre, sections et lien vers l’autre langue`, () => {
    const html = read(page.file);
    assert.match(html, new RegExp(`<html lang="${page.lang}"`));
    assert.match(html, /<title>[^<]{10,}<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]{40,}">/);
    assert.equal(html.match(/<h1[\s>]/g)?.length, 1, 'un seul h1');
    for (const id of SECTIONS) assert.ok(ids(html).includes(id), `section #${id} absente`);
    const switcher = new RegExp(
      `<a class="nav-lang" href="${page.other.href}" hreflang="${page.other.lang}" lang="${page.other.lang}">`,
    );
    assert.match(html, switcher, 'lien vers l’autre langue');
    for (const lang of ['en', 'fr', 'x-default']) {
      assert.match(html, new RegExp(`<link rel="alternate" hreflang="${lang}" href="${SITE_URL}`));
    }
    assert.match(
      html,
      new RegExp(`<link rel="canonical" href="${SITE_URL}${page.lang === 'fr' ? 'fr/' : ''}">`),
    );
  });

  test(`${page.file} : chaque section porte un titre, chaque ancre mène à un élément`, () => {
    const html = read(page.file);
    const known = new Set(ids(html));
    assert.equal(known.size, ids(html).length, 'identifiants en double');
    for (const id of attributes(html, 'aria-labelledby')) {
      for (const part of id.split(' '))
        assert.ok(known.has(part), `aria-labelledby="${part}" orphelin`);
    }
    for (const id of attributes(html, 'aria-controls'))
      assert.ok(known.has(id), `aria-controls="${id}"`);
    for (const href of attributes(html, 'href').filter((value) => value.startsWith('#'))) {
      assert.ok(known.has(href.slice(1)), `ancre ${href} sans cible`);
    }
  });

  test(`${page.file} : liens et images relatifs mènent à un fichier du site`, () => {
    const html = read(page.file);
    const urls = [
      ...attributes(html, 'href'),
      ...attributes(html, 'src'),
      ...attributes(html, 'srcset').flatMap((set) =>
        set.split(',').map((item) => item.trim().split(' ')[0]),
      ),
    ].filter((url) => url && !url.startsWith('#') && !/^[a-z]+:/.test(url));
    assert.ok(urls.length > 20, 'trop peu de liens relatifs : la page a-t-elle changé ?');
    for (const url of urls) {
      assert.ok(!url.startsWith('/'), `${url} : chemin absolu, cassé sous /factory-live/`);
      assert.ok(existsSync(target(page.file, url)), `${url} ne mène à aucun fichier`);
    }
  });

  test(`${page.file} : les vues de la démo existent dans l’app`, () => {
    const tokens = demoTokens();
    const views = attributes(read(page.file), 'href')
      .filter((href) => /demo\/#/.test(href))
      .map((href) => href.split('#')[1]);
    assert.ok(views.length >= 7, 'une tuile par vue de la démo');
    for (const view of views)
      assert.ok(tokens.includes(view), `demo/#${view} : vue inconnue de l’app`);
  });

  test(`${page.file} : rien ne vient d’ailleurs, liens externes en https`, () => {
    const html = read(page.file);
    assert.doesNotMatch(html, /<script[^>]+src="(?:https?:)?\/\//, 'script externe');
    assert.doesNotMatch(html, /<link[^>]+rel="(?:stylesheet|preload)"[^>]+href="(?:https?:)?\/\//);
    for (const href of attributes(html, 'href').filter((value) => /^[a-z]+:/.test(value))) {
      assert.match(href, /^https:\/\//, `${href} : lien externe non https`);
    }
  });

  test(`${page.file} : images décrites et dimensionnées`, () => {
    const html = read(page.file);
    const images = [...html.matchAll(/<img\s[^>]*>/g)].map((match) => match[0]);
    assert.ok(images.length >= 10, 'les captures de l’app');
    for (const image of images) {
      assert.match(image, /\salt="[^"]{20,}"/, `alt absent ou trop court : ${image.slice(0, 80)}`);
      assert.match(
        image,
        /\swidth="\d+" height="\d+"/,
        `dimensions absentes : ${image.slice(0, 80)}`,
      );
    }
  });
}

test('les deux langues ont la même structure : mêmes identifiants, dans le même ordre', () => {
  assert.deepEqual(ids(read('fr/index.html')), ids(read('index.html')));
});

test('ni tiret cadratin ni nom d’hôte de tailnet réel dans le site et les README', () => {
  const files = [
    ...PAGES.map((page) => join(DIST, page.file)),
    join(DIST, 'assets/site.css'),
    join(DIST, 'assets/site.js'),
    join(ROOT, 'README.md'),
    join(ROOT, 'README.fr.md'),
  ];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!text.includes(EM_DASH), `${file} : tiret cadratin`);
    // Les exemples s'écrivent <machine>.<tailnet>.ts.net ; un vrai nom d'hôte n'a rien à faire ici.
    assert.doesNotMatch(
      text,
      /\b[a-z0-9-]+\.[a-z0-9-]+\.ts\.net\b/i,
      `${file} : nom d’hôte tailnet`,
    );
  }
});

/** Le HTML d'une section de la page, de sa balise ouvrante à la suivante. */
function section(html, id) {
  const start = html.indexOf(`id="${id}"`);
  assert.notEqual(start, -1, `section #${id}`);
  const end = html.indexOf('<section', start + 1);
  return html.slice(start, end === -1 ? undefined : end);
}

for (const page of PAGES) {
  test(`${page.file} : la PWA est annoncée dès le héros, installable sur les trois familles d’appareils`, () => {
    const html = read(page.file);
    assert.match(section(html, 'top'), /Progressive Web App/, 'la PWA dans le héros');
    const screens = section(html, 'screens');
    assert.match(screens, /Progressive Web App/);
    // Les onglets parlent d'appareils, pas de marques : une PWA vaut aussi pour Android.
    const tabs = [...screens.matchAll(/role="tab"[^>]*>([^<]+)</g)].map((match) => match[1]);
    assert.equal(tabs.length, 3);
    for (const tab of tabs) assert.doesNotMatch(tab, /iPhone|iPad|Mac|Windows|Android/, tab);
    const devices = section(html, 'step-devices');
    for (const place of [screens, devices]) {
      for (const word of ['Chrome', 'Edge', 'Android', 'Safari', 'iPhone', 'iOS']) {
        assert.ok(place.includes(word), `${word} absent des façons d’installer`);
      }
    }
  });
}

test('les README présentent la PWA et ses trois installations', () => {
  for (const readme of ['README.md', 'README.fr.md']) {
    const text = readFileSync(join(ROOT, readme), 'utf8');
    for (const word of ['Progressive Web App', 'Android', 'Chrome', 'Edge', 'Safari', 'iOS 16.4']) {
      assert.ok(text.includes(word), `${readme} : ${word}`);
    }
  }
});

test('les styles sont embarqués : aucune @import, aucune adresse externe', () => {
  const css = read('assets/site.css');
  assert.doesNotMatch(css, /@import/);
  assert.doesNotMatch(css, /url\((?:["']?)(?:https?:)?\/\//);
  assert.match(css, /font-family: 'Mona Sans VF'/);
  for (const font of css.matchAll(/url\((fonts\/[^)]+)\)/g)) {
    assert.ok(existsSync(join(DIST, 'assets', font[1])), `${font[1]} manque`);
  }
});

test('la démo : chemins relatifs, ni manifeste ni service worker', () => {
  const html = read('demo/index.html');
  assert.doesNotMatch(html, /\s(?:src|href)="\/(?!\/)/, 'chemin absolu dans la démo');
  assert.doesNotMatch(html, /rel="manifest"/);
  const files = readdirSync(join(DIST, 'demo'));
  assert.ok(!files.includes('sw.js'), 'service worker dans la démo');
  assert.ok(!files.includes('manifest.webmanifest'), 'manifeste dans la démo');
  for (const asset of attributes(html, 'src').concat(attributes(html, 'href'))) {
    if (!/^[a-z]+:/.test(asset)) assert.ok(existsSync(target('demo/index.html', asset)), asset);
  }
});

test('les README renvoient au site et l’un vers l’autre', () => {
  const en = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const fr = readFileSync(join(ROOT, 'README.fr.md'), 'utf8');
  for (const readme of [en, fr]) assert.ok(readme.includes(SITE_URL), 'lien du site');
  assert.match(en, /\[Français\]\(README\.fr\.md\)/);
  assert.match(fr, /\[English\]\(README\.md\)/);
});
