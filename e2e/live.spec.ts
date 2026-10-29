import { expect, test } from '@playwright/test';
import { issueJob } from './helpers.ts';

const API = 'http://127.0.0.1:4182';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/__control/up`);
});

test('l’app branchée suit le flux : en direct, hors ligne sur le dernier état, puis de retour', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const status = page.locator('header p').first();
  await expect(status).toContainText('En direct');
  await expect(issueJob(page, 'cv-site#52')).toContainText('terminal · npm test');

  // Le serveur tombe (502, comme pendant un redémarrage du conteneur) : l'app le dit, garde l'état.
  await request.post(`${API}/__control/down`);
  await expect(status).toContainText('Hors ligne', { timeout: 15_000 });
  await expect(status).toContainText('dernier état');
  await expect(issueJob(page, 'cv-site#52')).toBeVisible();

  // Il revient : l'app se reconnecte seule, sans rechargement ni retour au premier plan.
  await request.post(`${API}/__control/up`);
  await expect(status).toContainText('En direct', { timeout: 15_000 });
});

test('Réglages : la section GitHub lit le serveur et mène à ses pages', async ({ page }) => {
  await page.goto('/settings');
  // La page de création s'écrit dans la langue de la PWA, que le lien lui passe.
  await expect(page.getByRole('link', { name: 'Créer l’App sur GitHub' })).toHaveAttribute(
    'href',
    '/api/github/setup?lang=fr',
  );
  // La vraie section, pas la démo : elle dit l'état réel de ce navigateur (le Chromium sans
  // interface des tests refuse les notifications ; un vrai navigateur propose de les activer).
  await expect(page.getByRole('region', { name: 'Notifications de cet appareil' })).toContainText(
    /Activer les notifications|ne reçoit pas de notifications|Notifications refusées/,
  );
  await expect(page.getByText(/Démo/)).toHaveCount(0);
});
