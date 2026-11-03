import { expect, test } from '@playwright/test';
import {
  expectNoHorizontalOverflow,
  graphScale,
  issueJob,
  pinch,
  stationJobs,
  swipeUp,
} from './helpers.ts';

test.describe('ligne d’usine (démo)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'La ligne d’usine' })).toBeVisible();
  });

  test('chaque issue a sa ligne dans sa station : son état, l’agent et son modèle, ce qui l’attend', async ({
    page,
  }) => {
    const team = issueJob(page, 'claude-cockpit#71');
    await expect(stationJobs(page, 'implementation')).toContainText('Vue ÉQUIPE');
    await expect(team).toContainText('coder-claude');
    await expect(team.locator('[data-component="Spinner"]')).toBeVisible();

    await expect(issueJob(page, 'cv-site#44')).toContainText('Carte prête mais retenue');
    await expect(issueJob(page, 'cv-site#49')).toContainText('Carte UI sans maquette jointe');
    // What waits for the owner opens first: the decision of cv-site#49, under the graph.
    await page
      .getByRole('button', { name: /^(Répondre|Voir le diagnostic)$/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/interventions\/iv-projects$/);
  });

  test('une issue qui change de station glisse vers sa nouvelle boîte', async ({ page }) => {
    // The demo scenario takes cv-site#47 through the gate at about 24 s: its PR waits for the owner's review.
    await expect(stationJobs(page, 'gate:failfirst')).toContainText('Formulaire de contact');
    await expect(stationJobs(page, 'review')).toContainText('Formulaire de contact', {
      timeout: 40_000,
    });
    // Elle a quitté la gate ; cv-site#52 y reste, arrêtée par le disjoncteur de son modèle.
    await expect(stationJobs(page, 'gate:failfirst')).not.toContainText('Formulaire de contact');
    await expect(stationJobs(page, 'gate:failfirst')).toContainText('Page À propos');
  });

  test('toucher une issue ouvre ses détails sous le graphe', async ({ page }) => {
    await issueJob(page, 'claude-cockpit#71').getByRole('button').click();
    await expect(page.getByRole('heading', { level: 2, name: /Vue ÉQUIPE/ })).toBeVisible();
  });

  test('le graphe entier tient dans la fenêtre à l’ouverture, à 390 et à 1440 px', async ({
    page,
  }) => {
    const bottom = await page
      .locator('[class*="_viewport_"]')
      .evaluate((element) => element.getBoundingClientRect().bottom);
    expect(bottom).toBeLessThanOrEqual(page.viewportSize()?.height ?? 0);
    const width = await page
      .locator('[class*="_sizer_"]')
      .evaluate((element) => element.getBoundingClientRect().width);
    const room = await page
      .locator('[class*="_scroller_"]')
      .evaluate((element) => element.clientWidth);
    expect(width).toBeLessThanOrEqual(room + 1);
  });

  test('deux doigts zooment le graphe et un doigt fait défiler la page', async ({
    page,
    browserName,
    isMobile,
  }) => {
    test.skip(browserName !== 'chromium' || !isMobile, 'gestes tactiles par CDP : Chromium mobile');
    const box = await page.locator('[class*="_scroller_"]').boundingBox();
    expect(box).not.toBeNull();
    const x = (box?.x ?? 0) + (box?.width ?? 0) / 2;
    const y = (box?.y ?? 0) + Math.min(120, (box?.height ?? 0) / 2);
    const before = await graphScale(page);
    await pinch(page, x, y, 60, 180);
    await expect.poll(() => graphScale(page)).toBeGreaterThan(before * 2);
    await swipeUp(page, x, y + 40);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  });

  test('les blocs Implémentation et Terminé ne débordent pas', async ({ page }) => {
    for (const box of ['implementation', 'done']) {
      const station = stationJobs(page, box);
      const overflow = await station.evaluate((element) => {
        const body = element.querySelector('[class*="_body_"]') as HTMLElement;
        const last = body.lastElementChild as HTMLElement;
        return {
          body: body.scrollHeight - body.clientHeight,
          last: last.getBoundingClientRect().bottom - element.getBoundingClientRect().bottom,
        };
      });
      expect(overflow.body, `${box} : contenu plus haut que sa boîte`).toBeLessThanOrEqual(0);
      expect(overflow.last, `${box} : dernière ligne sous le bord`).toBeLessThanOrEqual(0);
    }
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
