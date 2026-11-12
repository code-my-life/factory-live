import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const ROUTES = [
  '/',
  '/issues',
  '/issues/claude-cockpit/71',
  '/interventions/iv-projects',
  '/interventions/iv-hook',
  '/issues/factory-live/2',
  '/agents',
  '/health',
  '/costs',
  '/history',
  '/settings',
  // The screen of a generic workflow (#65), on the demo's made-up workflow, and an item's detail.
  '/workflows/essai',
  '/workflows/essai/e_0002',
];

/** The routes checked in the light theme too (the app opens dark). */
const LIGHT = new Set(['/workflows/essai', '/workflows/essai/e_0002']);

for (const [route, theme] of [
  ...ROUTES.map((each) => [each, 'dark'] as const),
  ...[...LIGHT].map((each) => [each, 'light'] as const),
]) {
  test(`accessibilité : ${route}${theme === 'light' ? ' (clair)' : ''}`, async ({ page }) => {
    if (theme === 'light')
      await page.addInitScript(() => localStorage.setItem('factory-live:color-mode', 'light'));
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // La page posée : Mona Sans chargée (elle change la largeur des textes, donc ce qui déborde), puis
    // deux images pour que les régions défilantes des tableaux de Primer aient pris leur tabindex.
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    });
    // On a generic workflow's screen (#65), the rows of its item's activity fade in when its detail
    // opens: their contrast is measured once they are in place. (The animations in a loop never end:
    // only those that do are waited for.)
    if (route.startsWith('/workflows/'))
      await page.waitForFunction(() =>
        document
          .getAnimations()
          .every(
            (animation) =>
              animation.playState !== 'running' ||
              animation.effect?.getTiming().iterations === Number.POSITIVE_INFINITY,
          ),
      );
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const serious = results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    );
    expect(
      serious.map(
        (violation) =>
          `${violation.id} : ${violation.help} (${violation.nodes
            .map((node) => node.target.join(' '))
            .slice(0, 3)
            .join(' | ')})`,
      ),
    ).toEqual([]);
  });
}
