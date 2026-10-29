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

test('la langue se choisit dans Réglages : l’interface change tout de suite et la garde au rechargement', async ({
  page,
}) => {
  await page.goto('/settings');
  const html = page.locator('html');
  const title = page.getByRole('heading', { level: 1 });
  await expect(html).toHaveAttribute('lang', 'fr');
  await expect(title).toHaveText('Réglages');
  await expect(page.getByRole('button', { name: 'Français' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('button', { name: 'English' }).click();
  await expect(title).toHaveText('Settings');
  await expect(html).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: 'Language' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Turn on notifications' })).toBeVisible();
  await expect(page.getByRole('banner')).toContainText('Live');

  await page.reload();
  await expect(title).toHaveText('Settings');
  await expect(html).toHaveAttribute('lang', 'en');
  await page.goto('/');
  await expect(title).toHaveText('Factory line');
  await expect(page.getByRole('group', { name: /^Factory line: the stages/ })).toBeVisible();
  await page.goto('/health');
  await expect(title).toHaveText('Health');

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Français' }).click();
  await expect(title).toHaveText('Réglages');
  await expect(html).toHaveAttribute('lang', 'fr');
  await page.reload();
  await expect(title).toHaveText('Réglages');
});

test.describe('navigateur dans une autre langue que le français', () => {
  test.use({ locale: 'de-DE' });

  test('l’app s’ouvre en anglais tant que rien n’est choisi', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Factory line');
    await page.goto('/settings');
    await expect(page.getByRole('button', { name: 'English' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
