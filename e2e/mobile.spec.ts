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

test('les coûts par modèle restent lisibles sur téléphone : la colonne Modèle ne s’écrase pas', async ({
  page,
}) => {
  await page.goto('/costs');
  const table = page.getByRole('table', { name: 'Par modèle' });
  const rows = table.getByRole('row').filter({ has: page.getByRole('cell') });
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all()) {
    const model = row.getByRole('cell').first();
    const box = await model.boundingBox();
    // La colonne garde sa largeur minimale (12rem) : avant, elle tombait à zéro, une lettre par ligne.
    expect(box?.width ?? 0, `colonne écrasée : ${await model.innerText()}`).toBeGreaterThanOrEqual(
      190,
    );
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

test('les coûts d’une issue s’affichent aussi sur téléphone, sans colonne qui déborde', async ({
  page,
}) => {
  await page.goto('/issues/claude-cockpit/71');
  await page.getByRole('link', { name: 'Coûts' }).click();
  const table = page.getByRole('table', { name: 'Consommation par run' });
  await expect(table).toBeVisible();
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

/** Les deux langues de l'interface : les libellés anglais sont parfois plus longs. */
const LANGUAGES = [
  { locale: 'fr-FR', name: 'français' },
  { locale: 'en-US', name: 'anglais' },
];

for (const { locale, name } of LANGUAGES) {
  test.describe(`en ${name}`, () => {
    test.use({ locale });

    test('aucun libellé de la barre d’onglets n’est tronqué, même sur un petit écran', async ({
      page,
    }) => {
      for (const width of [320, 360, 390]) {
        await page.setViewportSize({ width, height: 740 });
        await page.goto('/');
        const labels = page
          .getByRole('navigation', { name: 'Navigation', exact: true })
          .locator('[class*="tabLabel"]');
        await expect(labels).toHaveCount(5);
        for (const label of await labels.all()) {
          const cut = await label.evaluate((element) => element.scrollWidth - element.clientWidth);
          expect(cut, `${width} px : « ${await label.innerText()} » tronqué`).toBeLessThanOrEqual(
            0,
          );
        }
        await expectNoHorizontalOverflow(page);
      }
    });

    test('la valeur au sommet d’un graphique ne chevauche jamais son titre', async ({ page }) => {
      await page.goto('/costs');
      const charts = page.locator('figure').filter({ has: page.locator('[class*="peakLabel"]') });
      await expect(charts.first()).toBeVisible();
      for (const chart of await charts.all()) {
        const caption = await chart.locator('figcaption').boundingBox();
        const peak = await chart.locator('[class*="peakLabel"]').boundingBox();
        expect(caption && peak, 'titre et valeur dessinés').toBeTruthy();
        if (!caption || !peak) continue;
        expect(
          peak.y,
          `« ${await chart.locator('figcaption').innerText()} » : la valeur monte sur le titre`,
        ).toBeGreaterThanOrEqual(caption.y + caption.height);
      }
    });
  });
}
