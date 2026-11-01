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

test('les coûts par modèle restent lisibles sur téléphone : une fiche par modèle, sans débordement', async ({
  page,
}) => {
  await page.goto('/costs');
  // Under 544 px the table gives way to one card per model.
  await expect(page.getByRole('table', { name: 'Par modèle' })).toBeHidden();
  const cards = page.getByRole('list', { name: 'Par modèle' }).getByRole('listitem');
  await expect(cards.first()).toBeVisible();
  for (const card of await cards.all()) {
    const cardBox = await card.boundingBox();
    const badgeBox = await card.locator('[data-badge]').first().boundingBox();
    // A badge keeps at least 190 px (the old Model column minimum), unless its value is
    // shown whole (no clipped head or value): then it keeps its natural width.
    const shownWhole = await card
      .locator('[data-badge]')
      .first()
      .evaluate((badge) => {
        const fits = (element: Element | null) =>
          !element || element.scrollWidth <= element.clientWidth;
        return (
          fits(badge.querySelector('[data-segment="value"]')) &&
          fits(badge.querySelector('[data-part="head"]'))
        );
      });
    if (!shownWhole) {
      expect(
        badgeBox?.width ?? 0,
        `badge écrasé : ${await card.innerText()}`,
      ).toBeGreaterThanOrEqual(190);
    }
    expect(
      (badgeBox?.x ?? 0) + (badgeBox?.width ?? 0),
      `badge hors de sa fiche : ${await card.innerText()}`,
    ).toBeLessThanOrEqual((cardBox?.x ?? 0) + (cardBox?.width ?? 0));
    const overflow = await card.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(
      overflow,
      `contenu qui déborde de sa fiche : ${await card.innerText()}`,
    ).toBeLessThanOrEqual(0);
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
