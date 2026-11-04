import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow } from './helpers.ts';

/** The acceptance board of an issue's PR, under the graph of the line. */
const BOARD = 'section:has(> header + ol [data-widget])';

/** A big real PR (factory-live#18, PR #19) and a red one (cv-site#44, PR #50). */
const ROUTES = ['/issues/factory-live/18', '/issues/cv-site/44'];

for (const route of ROUTES) {
  test(`recette dépliée : aucun défilement de côté, et 44 px par cible au toucher : ${route}`, async ({
    page,
  }, testInfo) => {
    await page.goto(route);
    const board = page.locator(BOARD);
    await expect(board).toBeVisible();
    // Every fold of the board (widgets, green groups, captures), not the menus. The list shrinks at
    // each click, hence the first one each time.
    const folded = board.locator('button[aria-expanded="false"]:not([aria-haspopup])');
    for (let left = 20; left > 0 && (await folded.count()) > 0; left -= 1)
      await folded.first().click();
    await expect(folded).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    if (testInfo.project.name.includes('iphone')) {
      // The controls of the board's header and of each widget's head, on a touch screen.
      const small = await board.evaluate((root) =>
        [
          ...root.querySelectorAll(
            ':scope > header button, :scope > header a, [data-widget] > div:first-child button, [data-widget] > div:first-child a',
          ),
        ]
          .map((element) => element.getBoundingClientRect())
          .filter((box) => box.width > 0 && (box.width < 44 || box.height < 44))
          .map((box) => `${Math.round(box.width)}x${Math.round(box.height)}`),
      );
      expect(small, 'cibles de moins de 44 px').toEqual([]);
    }
  });

  test(`recette : aucune violation WCAG 2.2 AA (axe) : ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator(BOARD)).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    });
    const results = await new AxeBuilder({ page })
      .include(BOARD)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      results.violations.map(
        (violation) =>
          `${violation.id} : ${violation.help} (${violation.nodes
            .map((node) => node.target.join(' '))
            .slice(0, 3)
            .join(' | ')})`,
      ),
    ).toEqual([]);
  });
}
