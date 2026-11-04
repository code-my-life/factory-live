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
      // Every control of the board on a touch screen: its header, the head and the body of each widget.
      // Primer widens its small controls (segmented control, switch) by an absolute `::before` of 44 px:
      // that is their target.
      const small = await board.evaluate((root) =>
        [...root.querySelectorAll<HTMLElement>('button, a, input, select, [role="slider"]')]
          .map((element) => {
            const box = element.getBoundingClientRect();
            const before = getComputedStyle(element, '::before');
            const widened = before.content !== 'none' && before.position === 'absolute';
            const reach = (size: string) => (widened ? Number.parseFloat(size) || 0 : 0);
            return {
              element,
              width: Math.max(box.width, reach(before.minWidth)),
              height: Math.max(box.height, reach(before.minHeight)),
            };
          })
          .filter(({ width, height }) => width > 0 && (width < 44 || height < 44))
          .map(({ element, width, height }) => {
            const name = (element.getAttribute('aria-label') ?? element.textContent ?? '').trim();
            return `${element.tagName.toLowerCase()} « ${name.slice(0, 40)} » ${Math.round(width)}x${Math.round(height)}`;
          }),
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

test('un widget glissé par sa poignée annonce sa nouvelle place', async ({ page }) => {
  await page.goto('/issues/cv-site/44');
  const board = page.locator(BOARD);
  // The next widget folded: the drag is short, and stays in sight on a phone too.
  const checks = board.locator('[data-widget="checks"]');
  await checks.locator('h4 button').click();
  await expect(checks.locator('[data-collapsed]')).toHaveCSS('height', '0px');
  const handle = board.getByRole('button', { name: 'Déplacer « Critères d’acceptation »' });
  // The handle mid-view: a sticky bar covers the top of the page.
  await handle.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const from = await handle.boundingBox();
  const next = await checks.boundingBox();
  if (!from || !next) throw new Error('poignée ou widget hors de la page');
  const x = from.x + from.width / 2;
  await page.mouse.move(x, from.y + from.height / 2);
  await page.mouse.down();
  // In steps, as a hand moves; it lets go once it sees the widgets swap, as a hand would.
  await page.mouse.move(x, next.y + next.height * 0.8, { steps: 30 });
  await expect(board.locator('[data-widget]').first()).toHaveAttribute('data-widget', 'checks');
  await page.mouse.up();
  await expect(board.getByRole('status')).toHaveText('Critères d’acceptation : position 2 sur 6');
});
