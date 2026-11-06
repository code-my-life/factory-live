import { type Locator, expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, issueJob, stationJobs } from './helpers.ts';

/**
 * The controls of `root` under 44 px. Primer widens its small controls by an absolute `::before` of
 * 44 px: that is their target.
 */
function smallTargets(root: Locator): Promise<string[]> {
  return root.evaluate((element) =>
    [...element.querySelectorAll<HTMLElement>('button, a, input, textarea, select')]
      .map((control) => {
        const box = control.getBoundingClientRect();
        const before = getComputedStyle(control, '::before');
        const widened = before.content !== 'none' && before.position === 'absolute';
        const reach = (size: string) => (widened ? Number.parseFloat(size) || 0 : 0);
        return {
          control,
          width: Math.max(box.width, reach(before.minWidth)),
          height: Math.max(box.height, reach(before.minHeight)),
        };
      })
      .filter(({ width, height }) => width > 0 && (width < 44 || height < 44))
      .map(({ control, width, height }) => {
        const name = (control.getAttribute('aria-label') ?? control.textContent ?? '').trim();
        return `${control.tagName.toLowerCase()} « ${name.slice(0, 40)} » ${Math.round(width)}x${Math.round(height)}`;
      }),
  );
}

test('Studio : aucun défilement de côté, 44 px par cible, et le graphe dans son cadre', async ({
  page,
}, testInfo) => {
  await page.goto('/studio/presenter-factory-live');
  await expect(page.getByRole('heading', { level: 1, name: 'Studio' })).toBeVisible();
  // The eight stations of the sheet and the providers, the master to review at Revue.
  await expect(issueJob(page, 'presenter-factory-live')).toBeVisible();
  await expect(page.locator('[data-box]')).toHaveCount(9);
  await expect(stationJobs(page, 'models')).toContainText('studio-writer');

  const detail = page.getByRole('article');
  const gesture = page.getByRole('region', { name: 'Geste' });
  await expect(gesture.getByRole('button', { name: 'Valider' })).toBeVisible();
  // The reason's form open: its controls count too.
  await gesture.getByRole('button', { name: 'Refaire…' }).click();
  await expect(gesture.getByRole('textbox', { name: 'Raison' })).toBeVisible();
  await expect(detail.getByRole('group', { name: 'Mots calés' })).toBeVisible();

  // Nothing scrolls sideways, at 390 px as at 1440 px.
  await expectNoHorizontalOverflow(page);

  // The player keeps 9:16, without stretching.
  const screen = await detail
    .locator('[data-frame] > :first-child')
    .evaluate((element) => element.getBoundingClientRect());
  expect(screen.height / screen.width).toBeCloseTo(16 / 9, 1);

  // Every box and every link of the graph stays inside its frame.
  const frame = await page
    .locator('[class*="_viewport_"]')
    .evaluate((element) => element.getBoundingClientRect().toJSON() as DOMRect);
  const outside = await page.evaluate(
    ({ left, right, top, bottom }) =>
      [
        ...document.querySelectorAll<Element>(
          '[class*="_viewport_"] [data-box], [class*="_viewport_"] svg path',
        ),
      ]
        .map((element) => ({ element, box: element.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && box.height > 0)
        .filter(
          ({ box }) =>
            box.left < left - 0.5 ||
            box.right > right + 0.5 ||
            box.top < top - 0.5 ||
            box.bottom > bottom + 0.5,
        )
        .map(({ element }) => element.getAttribute('data-box') ?? element.tagName),
    frame,
  );
  expect(outside, 'hors du cadre du graphe').toEqual([]);

  if (testInfo.project.name.includes('iphone')) {
    // On a touch screen, each control of the detail reaches 44 px, every word of the script included.
    expect(await smallTargets(detail), 'cibles de moins de 44 px').toEqual([]);
  }
});

test("Studio : une étape done n'a pas la couleur d'échec", async ({ page }) => {
  await page.goto('/studio/vitrine-factory-live');
  const detail = page.getByRole('article');
  const done = detail.locator('li[data-result="done"]');
  await expect(done.first()).toBeVisible();

  // The failure colour as this page resolves it: a probe styled with the token, then removed.
  const danger = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--fgColor-danger)';
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });

  // `done` is the studio's word for a step that succeeded: none is painted as a failure.
  const colors = await done.evaluateAll((steps) =>
    steps.map((step) => getComputedStyle(step.querySelectorAll('span')[1] as Element).color),
  );
  expect(colors.length).toBeGreaterThan(0);
  for (const color of colors) expect(color, 'étape done').not.toBe(danger);
});
