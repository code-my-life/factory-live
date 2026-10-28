import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow } from './helpers.ts';

test.skip(
  ({ isMobile }) => !isMobile,
  'barre d’onglets et colonnes étroites : téléphone seulement',
);

test('le menu Plus s’ouvre à l’écran depuis le haut d’une longue page', async ({ page }) => {
  await page.goto('/history');
  await expect(page.getByRole('table', { name: 'Dernières issues terminées' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page
    .getByRole('navigation', { name: 'Navigation' })
    .getByRole('button', { name: 'Plus' })
    .tap();
  const menu = page.getByRole('menu');
  await expect(menu).toBeInViewport({ ratio: 1 });
  await menu.getByRole('menuitem', { name: 'Santé' }).tap();
  await expect(page).toHaveURL(/\/health$/);
});

test('les colonnes des dernières issues terminées ne débordent pas l’une sur l’autre', async ({
  page,
}) => {
  await page.goto('/history');
  const table = page.getByRole('table', { name: 'Dernières issues terminées' });
  const rows = table.getByRole('row').filter({ has: page.getByRole('cell') });
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all()) {
    for (const cell of await row.getByRole('cell').all()) {
      const overflow = await cell.evaluate((element) => element.scrollWidth - element.clientWidth);
      expect(
        overflow,
        `contenu qui déborde de sa colonne : ${await cell.innerText()}`,
      ).toBeLessThanOrEqual(0);
    }
  }
  await expectNoHorizontalOverflow(page);
});
