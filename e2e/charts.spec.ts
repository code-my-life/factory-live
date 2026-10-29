import { expect, test } from '@playwright/test';

/** Les listes de barres : par agent sur la page des coûts, par étape dans l'historique. */
for (const route of ['/costs', '/history']) {
  test(`${route} : la plus longue barre d’une liste remplit sa piste, la valeur à son bout`, async ({
    page,
  }) => {
    await page.goto(route);
    const lists = page.locator('ul[class*="barList"]');
    await expect(lists.first()).toBeVisible();
    for (const list of await lists.all()) {
      const bars = await list.locator('[class*="barFill"]').evaluateAll((fills) =>
        fills.map((fill) => ({
          width: fill.getBoundingClientRect().width,
          track: (fill.parentElement as HTMLElement).clientWidth,
        })),
      );
      expect(bars.length, 'des barres').toBeGreaterThan(1);
      const longest = Math.max(...bars.map((bar) => bar.width));
      const track = bars[0]?.track ?? 0;
      // La barre la plus longue fait 80 % de la piste : le reste est pour sa valeur.
      expect(longest, 'la plus longue barre, en px').toBeGreaterThan(track * 0.8 - 2);
      expect(
        bars.some((bar) => bar.width < longest),
        'les autres barres sont plus courtes',
      ).toBe(true);
    }
  });
}
