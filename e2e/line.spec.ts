import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, issueJob, stationJobs, swipeUp } from './helpers.ts';

test.describe('ligne d’usine (démo)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: /Ligne d’usine/ })).toBeVisible();
  });

  test('chaque issue a sa boîte : son état, l’agent qui la tient, ce qu’il fait', async ({
    page,
  }) => {
    const team = issueJob(page, 'claude-cockpit#71');
    await expect(team).toContainText('En cours');
    await expect(team).toContainText('coder-claude');
    await expect(team).toContainText('claude -p');
    await expect(team.locator('[data-component="Spinner"]')).toBeVisible();

    const footer = issueJob(page, 'cv-site#44');
    await expect(footer).toContainText('Bloquée');
    await expect(footer.getByRole('link', { name: 'Voir les commandes' })).toBeVisible();

    const projects = issueJob(page, 'cv-site#49');
    await expect(projects).toContainText('Attend ta décision');
    await projects.getByRole('link', { name: 'Répondre' }).click();
    await expect(page).toHaveURL(/\/interventions\/iv-projects$/);
  });

  test('une issue qui change de station passe dans sa nouvelle colonne', async ({ page }) => {
    // Le scénario de démo envoie cv-site#47 de Gate à Release vers 24 s.
    await expect(stationJobs(page, 'Gate')).toContainText('Formulaire de contact');
    await expect(stationJobs(page, 'Release')).toContainText('Formulaire de contact', {
      timeout: 40_000,
    });
    // Elle a quitté la gate ; cv-site#52 y reste, arrêtée par le disjoncteur de son modèle.
    await expect(stationJobs(page, 'Gate')).not.toContainText('Formulaire de contact');
  });

  test('toucher une issue ouvre sa page', async ({ page }) => {
    await issueJob(page, 'claude-cockpit#71').getByRole('link').first().click();
    await expect(page).toHaveURL(/\/issues\/claude-cockpit\/71$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Vue ÉQUIPE');
  });

  test('la page défile au doigt depuis la voie', async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== 'chromium' || !isMobile, 'gestes tactiles par CDP : Chromium mobile');
    const box = await stationJobs(page, 'Brief').boundingBox();
    expect(box).not.toBeNull();
    await swipeUp(page, 200, Math.max((box?.y ?? 0) + 40, 300));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  });
});

test('aucun écran ne déborde de côté', async ({ page }) => {
  for (const route of [
    '/',
    '/issues',
    '/issues/claude-cockpit/71',
    '/interventions',
    '/agents',
    '/health',
    '/costs',
    '/history',
    '/settings',
  ]) {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});
