import { expect, test } from '@playwright/test';

test('le graphe d’une issue montre ses cartes ; en choisir une donne ses runs, puis sa transcription', async ({
  page,
}) => {
  await page.goto('/issues/claude-cockpit/71');
  const graph = page.getByRole('group', { name: 'Graphe des cartes de l’issue' });
  for (const step of ['Brief', 'Implémentation', 'Release'])
    await expect(graph).toContainText(step);
  const brief = graph.getByRole('button', { name: /Vue ÉQUIPE/ });
  await brief.click();
  await expect(brief).toHaveAttribute('aria-pressed', 'true');
  // Ordinateur : le tableau des runs ; téléphone : leurs fiches. Seul ce qui est visible compte.
  await expect(page.getByText('#181').filter({ visible: true }).first()).toBeVisible();
  await page
    .getByRole('button', { name: /Transcription/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByRole('link', { name: 'Transcription' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('transcription : la session du plus récent au plus ancien, le terminal ouvert sur la fin', async ({
  page,
}) => {
  await page.goto('/issues/claude-cockpit/71');
  await page
    .getByRole('group', { name: 'Graphe des cartes de l’issue' })
    .getByRole('button', { name: /regrouper les cartes par projet/ })
    .filter({ hasNotText: 'Vue ÉQUIPE' })
    .click();
  await page
    .getByRole('button', { name: /Transcription/ })
    .filter({ visible: true })
    .first()
    .click();
  const session = page.getByRole('region', { name: /Session Hermès/ });
  const times = await session
    .locator('time')
    .evaluateAll((items) => items.map((item) => item.getAttribute('datetime') ?? ''));
  expect(times.length).toBeGreaterThan(2);
  expect(times).toEqual([...times].sort().reverse());

  await page.getByRole('button', { name: 'Terminal' }).click();
  const log = page.getByRole('log', { name: /Log brut du run/ });
  await expect(log).toContainText('2 failing');
  const box = await log.evaluate((element) => ({
    hidden: element.scrollHeight - element.clientHeight,
    fromBottom: element.scrollHeight - element.scrollTop - element.clientHeight,
    height: element.clientHeight,
    viewport: window.innerHeight,
  }));
  expect(box.hidden, 'le log défile dans son cadre').toBeGreaterThan(0);
  expect(box.height).toBeLessThanOrEqual(box.viewport * 0.6 + 1);
  expect(box.fromBottom, 'ouvert sur la fin').toBeLessThanOrEqual(1);
});
