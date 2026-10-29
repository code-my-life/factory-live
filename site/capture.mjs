// Refait les captures du site (site/src/img/) et celle du README (docs/factory-live.png) sur la
// démo : heure figée, animations en pause, police Mona Sans (la première de la pile de Primer).
// Les polices de secours varient d'un poste à l'autre : lancer dans l'image de Playwright (RUNBOOK).
//   node site/capture.mjs
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { serve } from './serve.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const IMG = join(ROOT, 'site/src/img');
const README_IMAGE = join(ROOT, 'docs/factory-live.png');
const NOW = new Date('2026-10-28T18:00:00Z');
const require = createRequire(import.meta.url);

const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
const IPAD = {
  viewport: { width: 820, height: 1180 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};
const IPHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

/**
 * Une capture : la vue (`route`), puis la zone à garder (`clip`, sinon l'écran entier). `clip`
 * reçoit la page et rend un rectangle en pixels CSS.
 */
const SHOTS = [
  { name: 'line-desktop', device: DESKTOP, route: '/' },
  {
    name: 'line-hero',
    device: DESKTOP,
    route: '/',
    clip: async (page) => onScreen(page, await box(page, ['main'], 0)),
  },
  { name: 'line-ipad', device: IPAD, route: '/' },
  { name: 'line-iphone', device: IPHONE, route: '/' },
  {
    name: 'live',
    device: DESKTOP,
    route: '/',
    clip: (page) => box(page, ['section[aria-labelledby="live-title"]']),
  },
  {
    name: 'issue-cards',
    device: DESKTOP,
    route: '/issues/claude-cockpit/71',
    clip: (page) => box(page, ['section[aria-labelledby="graph-title"]']),
  },
  {
    name: 'intervention',
    device: DESKTOP,
    route: '/interventions/iv-projects',
    clip: (page) => box(page, ['article[aria-labelledby="titre-iv-projects"]']),
  },
  {
    name: 'agent',
    device: DESKTOP,
    route: '/agents',
    clip: (page) =>
      box(page, [
        'article[aria-labelledby="agent-coder-claude"]',
        'article[aria-labelledby="agent-coder-opencode"]',
      ]),
  },
  {
    name: 'health',
    device: DESKTOP,
    route: '/health',
    clip: (page) =>
      box(page, [
        'section[aria-labelledby="groupe-hermes"]',
        'section[aria-labelledby="groupe-models"]',
      ]),
  },
  {
    name: 'costs',
    device: DESKTOP,
    route: '/costs',
    clip: (page) => box(page, ['section[aria-labelledby="models-title"]']),
  },
  {
    name: 'history',
    device: DESKTOP,
    route: '/history',
    clip: (page) => box(page, ['dl', 'section[aria-labelledby="gate-title"]']),
  },
  // L'aperçu des liens partagés (Open Graph) : un PNG, que tous les réseaux lisent.
  {
    name: 'og',
    device: { viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 },
    route: '/',
    png: true,
  },
];

/** Le rectangle qui réunit les premiers éléments de chaque sélecteur, avec une marge. */
async function box(page, selectors, margin = 12) {
  const rects = [];
  for (const selector of selectors) {
    const rect = await page.locator(selector).first().boundingBox();
    if (!rect) throw new Error(`Capture : ${selector} introuvable`);
    rects.push(rect);
  }
  const left = Math.max(0, Math.min(...rects.map((rect) => rect.x)) - margin);
  const top = Math.max(0, Math.min(...rects.map((rect) => rect.y)) - margin);
  const right = Math.max(...rects.map((rect) => rect.x + rect.width)) + margin;
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height)) + margin;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** La partie d'un rectangle visible sans défiler (la page s'arrête au bas de l'écran). */
function onScreen(page, rect) {
  const height = page.viewportSize()?.height ?? rect.y + rect.height;
  return { ...rect, height: Math.min(rect.height, height - rect.y) };
}

function buildDemo(outDir) {
  const result = spawnSync(
    'npm',
    ['run', 'build', '-w', '@factory-live/web', '--', '--emptyOutDir'],
    {
      cwd: ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        VITE_DATA_SOURCE: 'demo',
        FACTORY_LIVE_PWA: '0',
        FACTORY_LIVE_SOURCEMAP: '0',
        FACTORY_LIVE_OUT_DIR: outDir,
      },
    },
  );
  if (result.status !== 0) throw new Error('Build de la démo en échec');
}

function monaSansCss() {
  const font = readFileSync(
    require.resolve('@fontsource-variable/mona-sans/files/mona-sans-latin-wght-normal.woff2'),
  ).toString('base64');
  return `@font-face{font-family:"Mona Sans VF";font-weight:200 900;font-display:block;src:url(data:font/woff2;base64,${font}) format("woff2");}`;
}

/** Ré-encode une capture PNG en WebP dans le navigateur (aucun outil d'image sur le poste). */
async function toWebp(page, png) {
  const base64 = await page.evaluate(async (source) => {
    const image = new Image();
    image.src = `data:image/png;base64,${source}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d')?.drawImage(image, 0, 0);
    const blob = await new Promise((done) => canvas.toBlob(done, 'image/webp', 0.9));
    if (!blob) throw new Error('Encodage WebP impossible');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }, png.toString('base64'));
  return Buffer.from(base64, 'base64');
}

const workDir = mkdtempSync(join(tmpdir(), 'factory-live-capture-'));
try {
  buildDemo(join(workDir, 'demo'));
  const { server, url } = await serve({ root: join(workDir, 'demo'), spa: true });
  const browser = await chromium.launch();
  const encoder = await browser.newPage();
  const fontCss = monaSansCss();
  try {
    for (const shot of SHOTS) {
      const context = await browser.newContext({
        ...shot.device,
        colorScheme: 'dark',
        locale: 'fr-FR',
        timezoneId: 'Europe/Paris',
      });
      // La police entre au DOMContentLoaded : au tout début du document, <head> n'existe pas encore.
      await context.addInitScript((css) => {
        localStorage.setItem('factory-live:motion', 'paused');
        const add = () => {
          const style = document.createElement('style');
          style.textContent = css;
          document.head.append(style);
        };
        if (document.head) add();
        else document.addEventListener('DOMContentLoaded', add, { once: true });
      }, fontCss);
      const page = await context.newPage();
      await page.clock.setFixedTime(NOW);
      await page.goto(new URL(shot.route.slice(1), url).href);
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      const loaded = await page.evaluate(async () => {
        await document.fonts.load('600 16px "Mona Sans VF"');
        await document.fonts.ready;
        return [...document.fonts].some(
          (face) => face.family.replace(/"/g, '') === 'Mona Sans VF' && face.status === 'loaded',
        );
      });
      if (!loaded) throw new Error(`Capture ${shot.name} : Mona Sans non chargée`);
      await page.waitForTimeout(600);
      const clip = shot.clip ? await shot.clip(page) : undefined;
      const png = await page.screenshot({ clip, fullPage: Boolean(clip), animations: 'disabled' });
      if (shot.png) writeFileSync(join(IMG, `${shot.name}.png`), png);
      else writeFileSync(join(IMG, `${shot.name}.webp`), await toWebp(encoder, png));
      if (shot.name === 'line-desktop') writeFileSync(README_IMAGE, png);
      console.log(
        `${shot.name} : ${clip ? `${Math.round(clip.width)} x ${Math.round(clip.height)}` : 'écran'}`,
      );
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
