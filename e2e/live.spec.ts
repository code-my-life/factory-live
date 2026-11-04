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

test("la recette d'une PR réelle s'affiche avec ses checks, ses critères et ses retours", async ({
  page,
}) => {
  await page.goto('/issues/cv-site/52');
  // The server's recette, not the demo's: the head of factory-live#24 as GitHub gave it.
  const board = page.locator('section:has(> header + ol [data-widget])');
  await expect(board.getByRole('heading', { name: 'Recette de la PR #24' })).toBeVisible();
  // The red check in sight, leading to its job.
  await expect(
    board.getByRole('link', { name: /Bout en bout \(Chromium, WebKit\) et captures/ }),
  ).toHaveAttribute(
    'href',
    'https://github.com/code-my-life/factory-live/actions/runs/41859193780/job/126675985696',
  );
  // The criteria, folded by default: the one whose proof fails says so.
  await board.locator('[data-widget="criteria"] h4 button').click();
  await expect(board.getByRole('link', { name: /C2/ })).toContainText('Sa preuve échoue');
  // The thread still open in sight, the resolved one folded into its line.
  await expect(board.getByRole('link', { name: /Posted reviews disappear/ })).toHaveAttribute(
    'href',
    'https://github.com/code-my-life/factory-live/pull/24#discussion_r4469110873',
  );
  await expect(board.getByRole('button', { name: '1 retour résolu' })).toBeVisible();
  await expect(page.getByText(/Démo/)).toHaveCount(0);
});
