import { expect, test } from '@playwright/test';

test('répondre à une décision attendue la débloque, et on suit sa reprise', async ({ page }) => {
  await page.goto('/interventions/iv-projects');
  await page
    .getByLabel('Ta réponse')
    .fill('Option 2 : filtres en pastilles au-dessus de la grille.');
  await page.getByRole('button', { name: 'Débloquer' }).click();
  await expect(page.getByText('Réponse postée sur l’issue')).toBeVisible();
  await expect(page.getByText('Carte repartie')).toBeVisible({ timeout: 20_000 });
});
