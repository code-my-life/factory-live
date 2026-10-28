import { expect, test } from '@playwright/test';

test('les réglages de la démo rejouent les notifications et le parcours GitHub', async ({
  page,
}) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Activer les notifications' }).click();
  await expect(page.getByText(/Activées sur cet appareil/)).toBeVisible();
  for (const step of [
    'Créer l’App sur GitHub',
    'Installer sur les dépôts',
    'Se connecter à GitHub',
  ])
    await page.getByRole('button', { name: step }).click();
  await expect(page.getByText('Connecté en tant que')).toContainText('cddev');
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter à GitHub' })).toBeVisible();
});
