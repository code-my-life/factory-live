import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { expectOneLine, expectStandardBadge, hueTint, pauseMotion } from './helpers.ts';

/*
 * Captures de référence (démo, heure figée, animations coupées), produites et comparées dans l'image
 * officielle de Playwright pour que les polices soient les mêmes partout :
 * `npm run e2e:captures` (voir le RUNBOOK).
 */
const VIEWS = [
  ['ligne', '/'],
  ['issue', '/issues/claude-cockpit/71'],
  ['reglages', '/settings'],
] as const;

for (const [name, route] of VIEWS) {
  test(`capture : ${name}`, async ({ page }) => {
    await pauseMotion(page);
    await page.clock.setFixedTime(new Date('2026-10-28T18:00:00Z'));
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, animations: 'disabled' });
  });
}

/*
 * The standard of the badges (issue #11), on the screens of the captures, in both themes: two separate
 * parts, 20 px high, corners of `borderRadius-medium`, frame of the element's hue.
 */
const QWEN = 'Qwen3.5-9B-The-Defiant-Fable-Uncnr-Heretic-plusIQ-TOOLS-NEO-MAX-MTP-Q8_0';
const NEMOTRON = 'nvidia/nemotron-3-ultra-550b-a55b';

/** The badge of a type (its label word) inside a scope, narrowed by its value. */
function badge(page: Page, scope: Locator, word: string, value: string): Locator {
  return scope
    .locator('[data-badge]')
    .filter({ has: page.locator('[data-segment="label"]', { hasText: new RegExp(`^${word}$`) }) })
    .filter({ has: page.locator('[data-segment="value"]', { hasText: value }) });
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`badges, thème ${scheme === 'dark' ? 'sombre' : 'clair'}`, () => {
    test.beforeEach(async ({ page }) => {
      await pauseMotion(page);
      await page.addInitScript((value) => {
        localStorage.setItem('factory-live:color-mode', value);
      }, scheme);
    });

    test('l’écran d’une issue avec PR : issue, poste, agent, PR, CI et étiquette GitHub', async ({
      page,
    }) => {
      await page.goto('/issues/claude-cockpit/68');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const main = page.getByRole('main');
      const header = main.locator('header');
      const facts = main.locator('dl').first();
      // The repo's hue: issue and PR; the station's hue: release; the agent's: coder.
      await expectStandardBadge(
        header.locator('[data-badge][title="claude-cockpit#68"]'),
        hueTint('coral'),
      );
      await expectStandardBadge(badge(page, header, 'poste', 'Release'), hueTint('coral'));
      await expectStandardBadge(badge(page, facts, 'agent', 'coder'), hueTint('green'));
      await expectStandardBadge(facts.locator('[data-badge][title="#74"]'), hueTint('coral'));
      await expectStandardBadge(badge(page, facts, 'CI', 'réussie'), {
        frame: 'var(--borderColor-success-muted)',
        background: 'var(--bgColor-success-muted)',
      });
      // The GitHub label keeps its own color: 18 % on the value, 45 % on the frame.
      const label = badge(page, header, 'étiquette', 'factory');
      await expectStandardBadge(label, {
        frame: 'color-mix(in srgb, #5319e7 45%, var(--bgColor-default))',
        background: 'color-mix(in srgb, #5319e7 18%, var(--bgColor-default))',
      });
    });

    test('l’écran Agents : skill, toolset, plugin, serveur MCP, effort et modèle', async ({
      page,
    }) => {
      await page.goto('/agents');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const card = page.getByRole('article', { name: 'coordinator', exact: true });
      await expectStandardBadge(badge(page, card, 'skill', 'factory-brief'), hueTint('indigo'));
      await expectStandardBadge(badge(page, card, 'toolset', 'kanban'), hueTint('blue'));
      await expectStandardBadge(
        badge(page, card, 'plugin', 'coordinator-guard'),
        hueTint('indigo'),
      );
      await expectStandardBadge(badge(page, card, 'MCP', 'graphify'), hueTint('pink'));
      await expectStandardBadge(badge(page, card, 'effort', 'high'), hueTint('indigo'));
      await expectStandardBadge(badge(page, card, 'MoA', 'mix'), hueTint('plum'));
    });

    test('à la largeur d’un iPhone, les deux longs noms de modèle tiennent sur une ligne', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      for (const route of ['/agents', '/costs']) {
        await page.goto(route);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        for (const name of [QWEN, NEMOTRON])
          await expectOneLine(page.locator('[data-badge]:visible', { hasText: name }));
      }
    });
  });
}
