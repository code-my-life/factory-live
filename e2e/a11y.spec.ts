import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const ROUTES = [
  '/',
  '/issues',
  '/issues/claude-cockpit/71',
  '/interventions/iv-projects',
  '/agents',
  '/health',
  '/costs',
  '/history',
  '/settings',
];

for (const route of ROUTES) {
  test(`accessibilité : ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
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
