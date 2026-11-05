import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { expectNoHorizontalOverflow } from './helpers.ts';

/**
 * The controls of `root` under 44 px on a touch screen. A control stretched over its block by an
 * absolute `::after` (an item's row) or widened by an absolute `::before` (Primer's small controls)
 * reaches that far; a text field's target is its frame. The rows inside a graph's zoomable canvas
 * follow the graph's own rule instead, 24 px apart at the smallest zoom (`layout.test.ts`): the same
 * rows, unscaled, are measured in the catalogue's cells.
 */
function smallTargets(root: Locator): Promise<string[]> {
  return root.evaluate((element) =>
    [...element.querySelectorAll<HTMLElement>('button, a, input, select, [role="slider"]')]
      .filter((control) => control.getClientRects().length > 0)
      .filter((control) => !control.closest('[class*="_canvas_"]'))
      .map((control) => {
        const frame = control.tagName === 'INPUT' ? control.parentElement : null;
        const box = (frame ?? control).getBoundingClientRect();
        let width = box.width;
        let height = box.height;
        for (const part of ['::before', '::after'] as const) {
          const style = getComputedStyle(control, part);
          if (style.content === 'none' || style.position !== 'absolute') continue;
          width = Math.max(width, Number.parseFloat(style.minWidth) || 0);
          height = Math.max(height, Number.parseFloat(style.minHeight) || 0);
          // Stretched over its positioned ancestor (`inset: 0`): the ancestor is the target.
          const holder = control.offsetParent;
          if (style.inset === '0px' && holder) {
            const reach = holder.getBoundingClientRect();
            width = Math.max(width, reach.width);
            height = Math.max(height, reach.height);
          }
        }
        return { control, width, height };
      })
      .filter(({ width, height }) => width > 0 && (width < 44 || height < 44))
      .map(({ control, width, height }) => {
        const name = (control.getAttribute('aria-label') ?? control.textContent ?? '').trim();
        return `${control.tagName.toLowerCase()} « ${name.slice(0, 40)} » ${Math.round(width)}x${Math.round(height)}`;
      }),
  );
}

test('Composants : chaque bloc, sans défilement de côté', async ({ page, isMobile }) => {
  await page.goto('/composants');
  const catalogue = page.getByRole('region', { name: 'Composants' });
  await expect(page.getByRole('heading', { level: 1, name: 'Composants' })).toBeVisible();

  // Every block, each in its section.
  for (const title of [
    'Poste',
    'Nature du poste',
    'Ligne d’élément',
    'Fournisseurs',
    'Cadre d’un groupe',
    'Liens',
    'Légende',
    'Zoom',
    'Une fiche de trois postes',
  ])
    await expect(
      catalogue.getByRole('heading', { level: 2, name: title, exact: true }),
    ).toBeVisible();

  // The station in its states: empty, with rows, with « and N more », with the open row.
  await expect(catalogue.getByText('Aucune issue').first()).toBeVisible();
  await expect(catalogue.getByText('et 2 autres')).toBeVisible();
  await expect(catalogue.locator('[data-box="write"] [data-selected]')).toHaveCount(1);
  // The four kinds of work, each with its chip; the end has none.
  for (const kind of ['ai', 'script', 'github', 'owner'])
    await expect(catalogue.locator(`[data-kind="${kind}"]`).first()).toBeVisible();
  await expect(catalogue.getByText('Fin : aucune puce')).toBeVisible();
  // An item's row in every state, with an agent and its model, waiting for a slot.
  for (const tone of ['accent', 'attention', 'danger', 'secondary', 'done'])
    await expect(catalogue.locator(`[data-issue][data-tone="${tone}"]`).first()).toBeVisible();
  await expect(catalogue.getByText('coder-claude · claude-opus-5-5').first()).toBeVisible();
  await expect(catalogue.getByText(/Attend une place/).first()).toBeVisible();
  // The providers empty, at rest, answering.
  await expect(catalogue.locator('[data-box="models"]')).toHaveCount(4);
  await expect(catalogue.locator('[data-busy]').first()).toBeVisible();
  // Every kind of link at rest and in use, the returns taken after a failure and on a request.
  for (const variant of ['line', 'return', 'branch', 'fan']) {
    await expect(catalogue.locator(`svg[data-link="${variant}"]:not([data-active])`)).toHaveCount(
      1,
    );
    await expect(
      catalogue.locator(`svg[data-link="${variant}"][data-active]`).first(),
    ).toBeVisible();
  }
  for (const cause of ['problem', 'request'])
    await expect(catalogue.locator(`svg[data-link="return"][data-cause="${cause}"]`)).toBeVisible();
  // The legend closed and open, the zoom, the frame of a group.
  await expect(catalogue.getByRole('list', { name: 'Légende des liens' })).toHaveCount(1);
  await expect(catalogue.getByRole('group', { name: 'Zoom du graphe' }).first()).toBeVisible();
  await expect(catalogue.locator('[class*="_gateFrame_"]')).toBeVisible();
  // The sheet of three stations, drawn with the blocks; the refused one says why.
  const graph = catalogue.getByRole('region', { name: 'La ligne d’usine' });
  for (const station of ['write', 'render', 'approve'])
    await expect(graph.locator(`[data-box="${station}"]`)).toBeVisible();
  await expect(catalogue.getByText(/duplicate station "write"/)).toBeVisible();

  await expectNoHorizontalOverflow(page);
  if (isMobile) expect(await smallTargets(catalogue), 'cibles de moins de 44 px').toEqual([]);
});
