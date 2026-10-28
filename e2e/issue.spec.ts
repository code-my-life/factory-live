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
