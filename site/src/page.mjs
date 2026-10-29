// Le gabarit du site : une seule structure, rendue en anglais et en français à partir des textes de
// content/. Les ancres, les sections et les liens sont donc les mêmes dans les deux langues.
import { icon, logo } from './icons.mjs';

export const SITE_URL = 'https://code-my-life.github.io/factory-live/';
export const REPO_URL = 'https://github.com/code-my-life/factory-live';

/** Échappe un texte pour un attribut HTML (les textes de content/ sont déjà du HTML). */
function attr(text) {
  return String(text)
    .replace(/<[^>]+>/g, '')
    .replace(/&(?!(?:[a-z]+|#\d+);)/g, '&amp;')
    .replace(/"/g, '&quot;');
}

function escapeCode(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Les liens de content/ : `REPO` vaut l'adresse du dépôt, `demo/` part de la racine du site. */
function href(target, root) {
  if (target.startsWith('REPO')) return REPO_URL + target.slice('REPO'.length);
  if (/^[a-z]+:/.test(target) || target.startsWith('#')) return target;
  return root + target;
}

function external(target) {
  return /^https?:/.test(target) ? ' rel="noopener"' : '';
}

/**
 * Une image du site : `name` dans assets/img, sa densité (2x, 3x) et sa taille en pixels mesurée au
 * build (`page.images`). Les attributs width et height réservent la place avant le chargement.
 */
function img(page, name, density, alt, extra = '') {
  const size = page.images[name];
  if (!size) throw new Error(`Image absente : ${name}`);
  const src = `${page.root}assets/img/${name}`;
  const width = Math.round(size.width / density);
  const height = Math.round(size.height / density);
  return `<img src="${src}" srcset="${src} ${density}x" width="${width}" height="${height}" alt="${attr(alt)}"${extra}>`;
}

function head(t, page) {
  const url = SITE_URL + page.path;
  const other = SITE_URL + page.otherPath;
  return `<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t.meta.title}</title>
<meta name="description" content="${attr(t.meta.description)}">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0d1117">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="${t.lang}" href="${url}">
<link rel="alternate" hreflang="${page.otherLang}" href="${other}">
<link rel="alternate" hreflang="x-default" href="${SITE_URL}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="factory-live">
<meta property="og:title" content="${attr(t.meta.title)}">
<meta property="og:description" content="${attr(t.meta.description)}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="${t.lang === 'fr' ? 'fr_FR' : 'en_US'}">
<meta property="og:image" content="${SITE_URL}assets/img/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${attr(t.meta.ogAlt)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${page.root}favicon.svg" type="image/svg+xml">
<link rel="preload" href="${page.root}assets/fonts/mona-sans-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${page.root}assets/site.css">
<script>document.documentElement.classList.add('js')</script>
<script src="${page.root}assets/site.js" defer></script>
</head>`;
}

function masthead(t, page) {
  const links = ['see', 'how', 'start', 'security', 'roadmap']
    .map((id) => `<li><a class="nav-link" href="#${id}">${t.nav[id]}</a></li>`)
    .join('');
  return `<header class="masthead">
<a class="brand" href="./">${logo('brand-logo')}<span>factory-live</span></a>
<nav class="masthead-nav" aria-label="${attr(t.nav.label)}">
<ul class="nav-links" role="list">${links}</ul>
<details class="nav-menu">
<summary class="nav-menu-toggle">${t.nav.menu}</summary>
<ul class="nav-menu-list" role="list">${links}</ul>
</details>
<a class="nav-lang" href="${page.otherHref}" hreflang="${page.otherLang}" lang="${page.otherLang}">${t.nav.other}</a>
<a class="button button-small" href="${page.root}demo/">${t.nav.demo}</a>
</nav>
</header>`;
}

function hero(t, page) {
  return `<section class="hero" id="top" aria-labelledby="hero-title">
<div class="hero-copy">
<h1 class="hero-title" id="hero-title">${t.hero.title}</h1>
<div class="hero-body">
<p class="hero-lede">${t.hero.lede}</p>
<div class="hero-actions">
<a class="button button-primary button-large" href="${page.root}demo/">${t.hero.cta}</a>
<a class="link-quiet" href="${REPO_URL}" rel="noopener">${icon('MarkGithubIcon')}<span class="link-quiet-label">${t.hero.source}</span></a>
</div>
<p class="hero-note">${t.hero.note}</p>
</div>
</div>
<div class="hero-stage">
<span class="stage-stop" aria-hidden="true">${logo('stage-logo')}</span>
<div class="hero-shot" data-ui>
<picture>
<source media="(max-width: 47.99rem)" srcset="${page.root}assets/img/line-iphone.webp 3x" width="${Math.round(page.images['line-iphone.webp'].width / 3)}" height="${Math.round(page.images['line-iphone.webp'].height / 3)}">
${img(page, 'line-hero.webp', 2, t.hero.alt, ' class="hero-image" fetchpriority="high"')}
</picture>
</div>
</div>
</section>`;
}

const SCREEN_IMAGES = {
  desktop: { file: 'line-desktop.webp', density: 2 },
  ipad: { file: 'line-ipad.webp', density: 2 },
  iphone: { file: 'line-iphone.webp', density: 3 },
};

function screens(t, page) {
  const tabs = t.screens.tabs
    .map(
      (tab, index) =>
        `<button class="screen-tab" type="button" role="tab" id="screen-tab-${tab.id}" aria-controls="screen-${tab.id}" aria-selected="${index === 0}"${index === 0 ? '' : ' tabindex="-1"'}>${tab.label}</button>`,
    )
    .join('');
  const panels = t.screens.tabs
    .map((tab) => {
      const image = SCREEN_IMAGES[tab.id];
      return `<figure class="screen" id="screen-${tab.id}" role="tabpanel" aria-labelledby="screen-tab-${tab.id}" data-screen="${tab.id}">
${img(page, image.file, image.density, tab.alt, ' class="screen-image" loading="lazy" decoding="async"')}
</figure>`;
    })
    .join('\n');
  return `<section class="screens" id="screens" aria-labelledby="screens-title">
<div class="wrap screens-inner">
<div class="screens-plate" data-ui data-reveal>
${panels}
</div>
<div class="screens-copy" data-reveal>
<div class="screen-tabs" role="tablist" aria-label="${attr(t.screens.tabsLabel)}">${tabs}</div>
<div class="screens-body">
<h2 class="section-title" id="screens-title">${t.screens.title}</h2>
<p class="screens-text">${t.screens.text}</p>
</div>
<div class="screens-actions">
<a class="cell cell-ink" href="${page.root}demo/">${t.screens.open}</a>
<a class="cell" href="#start">${t.screens.install}</a>
</div>
</div>
</div>
</section>`;
}

const TILE_IMAGES = {
  issue: 'issue-cards.webp',
  intervention: 'intervention.webp',
  agent: 'agent.webp',
  live: 'live.webp',
  health: 'health.webp',
  costs: 'costs.webp',
  history: 'history.webp',
};

function see(t, page) {
  const tiles = t.see.tiles
    .map((tile) => {
      return `<article class="tile tile-${tile.id}" aria-labelledby="tile-${tile.id}" data-reveal>
<div class="tile-shot" data-ui>${img(page, TILE_IMAGES[tile.id], 2, tile.alt, ' class="tile-image" loading="lazy" decoding="async"')}</div>
<div class="tile-copy">
<h3 class="tile-title" id="tile-${tile.id}">${tile.title}</h3>
<p class="tile-text">${tile.text}</p>
<a class="tile-link" href="${page.root}demo/#${tile.view}" aria-describedby="tile-${tile.id}">${t.see.open}${icon('ArrowRightIcon')}</a>
</div>
</article>`;
    })
    .join('\n');
  return `<section class="see" id="see" aria-labelledby="see-title">
<div class="wrap see-inner">
<div class="board">
<div class="tile tile-heading" data-reveal><h2 class="section-title" id="see-title">${t.see.title}</h2></div>
${tiles}
</div>
</div>
</section>`;
}

function nodeStop(node) {
  return node.icon === 'logo' ? logo('node-logo') : icon(node.icon, 24);
}

function how(t) {
  const { stages, schema } = t.how;
  const clauses = stages
    .map(
      (stage) => `<li class="stage" data-stage="${stage.id}">
<h3 class="stage-title">${stage.title}</h3>
<p class="stage-text">${stage.text}</p>
</li>`,
    )
    .join('\n');
  const names = stages
    .map(
      (stage, index) =>
        `<li><button class="stage-name" type="button" data-to="${index + 1}" aria-pressed="${index === 0}">${stage.label}</button></li>`,
    )
    .join('');
  const nodes = schema.nodes
    .map((node) => {
      const link = schema.links.find((candidate) => candidate.from === node.id);
      const items = node.items
        .map(([on, label]) => `<li class="chip" data-on="${on}">${label}</li>`)
        .join('');
      const segment = link
        ? `<p class="segment" data-on="${Object.keys(link.stages).join(' ')}">${Object.entries(
            link.stages,
          )
            .map(
              ([stage, label]) => `<span class="segment-label" data-for="${stage}">${label}</span>`,
            )
            .join('')}</p>`
        : '';
      return `<li class="node" data-node="${node.id}">
<span class="node-stop" aria-hidden="true">${nodeStop(node)}</span>
<div class="node-body">
<p class="node-title">${node.title} <span class="node-sub">${node.sub}</span></p>
<ul class="chips" role="list">${items}</ul>
</div>
${segment}
</li>`;
    })
    .join('\n');
  return `<section class="how" id="how" aria-labelledby="how-title" data-stage="listen">
<div class="wrap how-inner">
<div class="how-head" data-reveal>
<h2 class="section-title" id="how-title">${t.how.title}</h2>
<p class="how-intro">${t.how.intro}</p>
</div>
<div class="how-split" data-reveal>
<div class="how-clauses">
<ol class="stages" role="list" aria-live="polite">
${clauses}
</ol>
<div class="stage-control">
<label class="visually-hidden" for="stage-range">${t.how.stageLabel}</label>
<input class="stage-range" id="stage-range" type="range" min="1" max="${stages.length}" step="1" value="1" aria-valuetext="${attr(stages[0].label)}" data-labels="${attr(stages.map((stage) => stage.label).join('|'))}">
<ol class="stage-names" role="list">${names}</ol>
</div>
</div>
<figure class="schema" data-ui>
<figcaption class="visually-hidden">${schema.label}</figcaption>
<ol class="schema-line" role="list">
${nodes}
</ol>
<p class="schema-back" data-on="${schema.back.stage}">${icon('SyncIcon')}<span>${schema.back.text}</span></p>
</figure>
</div>
<p class="how-note">${t.how.note}</p>
</div>
</section>`;
}

function start(t) {
  const { steps } = t.start;
  const tabs = steps
    .map(
      (step, index) =>
        `<button class="step-tab" type="button" role="tab" id="step-tab-${step.id}" aria-controls="step-${step.id}" aria-selected="${index === 0}"${index === 0 ? '' : ' tabindex="-1"'}><span class="step-tab-name">${step.label}</span><span class="step-tab-hint">${step.hint}</span></button>`,
    )
    .join('');
  const panels = steps
    .map((step) => {
      const rows = step.rows
        .map(
          (row) => `<li class="band">
<h4 class="band-title">${row.title}</h4>
<div class="band-body">
<p class="band-text">${row.text}</p>
${row.code ? `<pre class="code" data-ui tabindex="0"><code>${escapeCode(row.code)}</code></pre>` : ''}
</div>
</li>`,
        )
        .join('\n');
      return `<section class="step" id="step-${step.id}" role="tabpanel" aria-labelledby="step-tab-${step.id}">
<h3 class="step-title">${step.label}</h3>
<ol class="bands" role="list">
${rows}
</ol>
</section>`;
    })
    .join('\n');
  return `<section class="start" id="start" aria-labelledby="start-title">
<div class="wrap start-inner">
<div class="start-head" data-reveal>
<div class="start-intro">
<h2 class="section-title" id="start-title">${t.start.title}</h2>
<p class="start-text">${t.start.text}</p>
</div>
<a class="button" href="${REPO_URL}#getting-started" rel="noopener">${t.start.guide}</a>
</div>
<div class="start-body" data-reveal>
<div class="step-tabs" role="tablist" aria-label="${attr(t.start.tabsLabel)}" aria-orientation="vertical">${tabs}</div>
<div class="step-panels">
${panels}
</div>
</div>
</div>
</section>`;
}

function security(t) {
  const groups = t.security.groups
    .map(
      (group) => `<div class="guard" data-reveal>
<h3 class="guard-title">${group.title}</h3>
<ul class="guard-rows" role="list">
${group.rows.map(([name, value]) => `<li class="guard-row"><span class="guard-name">${name}</span><span class="guard-value">${value}</span></li>`).join('\n')}
</ul>
</div>`,
    )
    .join('\n');
  return `<section class="security" id="security" aria-labelledby="security-title">
<div class="wrap security-inner">
<div class="security-head" data-reveal>
<h2 class="section-title" id="security-title">${t.security.title}</h2>
<p class="security-text">${t.security.text}</p>
</div>
<div class="guards">
${groups}
</div>
</div>
</section>`;
}

function roadmap(t) {
  const all = t.roadmap.stops;
  const stops = all
    .map((stop, index) => {
      const next = all[index + 1];
      const track = !next
        ? ''
        : stop.state === 'done' && next.state === 'done'
          ? 'done'
          : stop.state === 'done' && next.state === 'now'
            ? 'flow'
            : 'todo';
      return `<li class="milestone" data-state="${stop.state}"${track ? ` data-track="${track}"` : ''} data-reveal>
<span class="milestone-stop" aria-hidden="true">${icon(stop.icon, 24)}</span>
<p class="milestone-state">${t.roadmap.states[stop.state]}</p>
<h3 class="milestone-title">${stop.title}</h3>
<p class="milestone-text">${stop.text}</p>
</li>`;
    })
    .join('\n');
  return `<section class="roadmap" id="roadmap" aria-labelledby="roadmap-title">
<div class="wrap roadmap-inner">
<div class="roadmap-head" data-reveal>
<h2 class="section-title" id="roadmap-title">${t.roadmap.title}</h2>
<p class="roadmap-text">${t.roadmap.text}</p>
</div>
<ol class="milestones" role="list" aria-label="${attr(t.roadmap.label)}" data-ui>
${stops}
</ol>
</div>
</section>`;
}

function cta(t, page) {
  return `<section class="cta-band" aria-label="${attr(t.cta.label)}">
<div class="wrap">
<a class="cta" href="${page.root}demo/">
<span class="cta-head"><span class="cta-text">${t.cta.text}</span><span class="cta-arrow" aria-hidden="true">${icon('ArrowUpRightIcon', 24)}</span></span>
<span class="cta-word" aria-hidden="true">${t.cta.word}</span>
</a>
</div>
</section>`;
}

function footer(t, page) {
  const columns = t.footer.columns
    .map(
      (column) => `<div class="footer-column">
<h2 class="footer-title">${column.title}</h2>
<ul role="list">${column.links
        .map(
          ([label, target]) =>
            `<li><a class="footer-link" href="${href(target, page.root)}"${external(href(target, page.root))}>${label}</a></li>`,
        )
        .join('')}</ul>
</div>`,
    )
    .join('\n');
  return `<footer class="footer">
<div class="wrap footer-inner">
<p class="footer-mark" aria-hidden="true">${logo('footer-logo')}<span>factory-live</span></p>
<div class="footer-grid">
<nav class="footer-links" aria-label="${attr(t.footer.label)}">
${columns}
</nav>
<div class="footer-about">
<p>${t.footer.made}</p>
<p>${t.footer.rights}</p>
<div class="footer-actions">
<a class="nav-lang" href="${page.otherHref}" hreflang="${page.otherLang}" lang="${page.otherLang}">${t.nav.other}</a>
<a class="button button-small" href="#top">${t.footer.top}</a>
</div>
</div>
</div>
</div>
</footer>`;
}

/**
 * @param {any} t les textes d'une langue (content/en.mjs ou content/fr.mjs)
 * @param {{ path: string, root: string, otherLang: string, otherPath: string, otherHref: string,
 *   images: Record<string, { width: number, height: number }> }} page
 */
export function renderPage(t, page) {
  return `<!doctype html>
<html lang="${t.lang}" data-color-mode="dark" data-dark-theme="dark" data-light-theme="light">
${head(t, page)}
<body>
<a class="skip-link" href="#content">${t.skip}</a>
${masthead(t, page)}
<main id="content">
${hero(t, page)}
${screens(t, page)}
${see(t, page)}
${how(t)}
${start(t)}
${security(t)}
${roadmap(t)}
${cta(t, page)}
</main>
${footer(t, page)}
</body>
</html>
`;
}
