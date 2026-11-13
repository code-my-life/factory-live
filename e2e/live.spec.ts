import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { issueJob, stationJobs } from './helpers.ts';

/**
 * The live app, served by factory-live's real server on the core's side (LIVE_SOURCE=workflow-core),
 * reading a fake workflow-core (e2e/fake-api.mjs, scenario in e2e/fake-core-scenario.mjs, #67).
 */
const CORE = 'http://127.0.0.1:4182';

test.describe.configure({ mode: 'serial' });

/** The fake core back to its first state, as a new epoch: the server reads it all again. */
async function initial(request: APIRequestContext) {
  await request.post(`${CORE}/__control/up`);
  await request.post(`${CORE}/__control/reset`, { data: { state: 'initial' } });
}

test.beforeEach(async ({ request }) => {
  await initial(request);
});

test.describe('lecture par le socle', () => {
  test('l’app branchée suit le flux : en direct, hors ligne sur le dernier état, puis de retour', async ({
    page,
  }) => {
    await page.goto('/');
    const status = page.locator('header p').first();
    await expect(status).toContainText('En direct');
    await expect(issueJob(page, 'cv-site#52')).toBeVisible();

    // The link with the server cut on the browser's side (502, as while the container restarts): the
    // app opens on the last state it kept, and says so.
    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 502, body: '{"error":"Conteneur en redémarrage"}' }),
    );
    await page.reload();
    await expect(status).toContainText('Hors ligne', { timeout: 15_000 });
    await expect(status).toContainText('dernier état');
    await expect(issueJob(page, 'cv-site#52')).toBeVisible();

    // The link comes back: the app reconnects alone, without a reload.
    await page.unroute('**/api/**');
    await expect(status).toContainText('En direct', { timeout: 15_000 });
  });

  test('un reset du socle fait relire l’état complet', async ({ page, request }) => {
    await page.goto('/');
    await expect(
      stationJobs(page, 'implementation').locator('[data-issue="cv-site#52"]'),
    ).toBeVisible();
    await expect(issueJob(page, 'cv-site#49')).toBeVisible();

    // The core rebuilds its journal on another state: cv-site#52 is at the gate, cv-site#49 has gone.
    await request.post(`${CORE}/__control/reset`, { data: { state: 'after' } });
    await expect(
      stationJobs(page, 'gate:failfirst').locator('[data-issue="cv-site#52"]'),
    ).toBeVisible();
    await expect(issueJob(page, 'cv-site#49')).toHaveCount(0);
  });

  test('un changement de carte du socle arrive à l’écran en moins d’une seconde', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    const atGate = stationJobs(page, 'gate:failfirst').locator('[data-issue="cv-site#52"]');
    await expect(
      stationJobs(page, 'implementation').locator('[data-issue="cv-site#52"]'),
    ).toBeVisible();
    await expect(atGate).toHaveCount(0);

    // The impl of cv-site#52 goes into review: the core says so on its stream, and the issue moves.
    const sent = Date.now();
    await request.post(`${CORE}/__control/change`, {
      data: { id: 't_c0de0052', patch: { status: 'review' } },
    });
    await expect(atGate).toBeVisible({ timeout: 2_000 });
    expect(Date.now() - sent).toBeLessThan(1_000);
  });

  test('une intervention du socle s’affiche avec son diagnostic et se débloque par /factory unblock', async ({
    page,
    request,
  }) => {
    const { id } = (await (await request.get(`${CORE}/__control/intervention`)).json()) as {
      id: string;
    };
    const before = ((await (await request.get(`${CORE}/__control/comments`)).json()) as unknown[])
      .length;
    await page.goto(`/interventions/${encodeURIComponent(id)}`);
    // The core's diagnosis, in factory-live's words.
    await expect(
      page.getByText('L’agent pose une question et aucune cause technique n’apparaît'),
    ).toBeVisible();

    const answer = 'PostgreSQL, pour la recherche plein texte.';
    await page.getByLabel('Ta réponse').fill(answer);
    await page.getByRole('button', { name: 'Débloquer', exact: true }).click();
    await expect(page.getByText('Réponse postée sur l’issue')).toBeVisible();

    const comments = (await (await request.get(`${CORE}/__control/comments`)).json()) as {
      path: string;
      body: string;
    }[];
    expect(comments.slice(before)).toEqual([
      {
        path: '/repos/code-my-life/cv-site/issues/49/comments',
        body: `/factory unblock ${answer}`,
      },
    ]);
  });

  test('la recette d’une PR montre les jumeaux et les preuves servis par le socle', async ({
    page,
  }) => {
    await page.goto('/issues/cv-site/52');
    const board = page.locator('section:has(> header + ol [data-widget])');
    // The server reads the PR on GitHub (the fake one) every 30 s: the recette comes with its first pass.
    await expect(board.getByRole('heading', { name: 'Recette de la PR #24' })).toBeVisible({
      timeout: 45_000,
    });
    // The twins' state and the gate's three proofs of the PR's head, both served by the core.
    await expect(board.locator('[data-widget="twins"]')).toContainText('Jumeaux prêts sur le banc');
    const proofs = board.locator('[data-widget="proofs"]');
    await expect(proofs).toContainText('3 à voir');
    for (const text of [
      'Le test échouait avant la correction.',
      'Le test casse quand on retire le lien.',
      'Les autres pages ne changent pas.',
    ])
      await expect(proofs).toContainText(text);
    // Its checks and its review threads, read on GitHub (fixtures/github-acceptance, factory-live#24).
    await expect(board.locator('[data-widget="checks"]')).toContainText('11 checks réussis');
    // All six threads of factory-live#24 are resolved: folded into their line.
    await expect(board.getByRole('button', { name: '6 retours résolus' })).toBeVisible();
    await expect(page.getByText(/Démo/)).toHaveCount(0);
  });

  test('socle coupé, l’écran dit socle injoignable puis revient seul', async ({
    page,
    request,
  }) => {
    await page.goto('/health');
    const tile = page.getByText('Socle (workflow-core)').last();
    await expect(tile).toBeVisible();

    await request.post(`${CORE}/__control/down`);
    await expect(page.getByText(/Socle injoignable depuis/)).toBeVisible({ timeout: 10_000 });

    await request.post(`${CORE}/__control/up`);
    await expect(page.getByText(/Socle injoignable depuis/)).toHaveCount(0, { timeout: 15_000 });
  });

  test('l’action en cours d’un agent vient du direct du socle', async ({ page }) => {
    await page.goto('/');
    await expect(issueJob(page, 'cv-site#52')).toContainText('terminal · npm test');
  });

  test('un workflow déclaré au socle s’affiche dans l’écran générique', async ({ page }) => {
    await page.goto('/workflows/essai');
    for (const station of ['Préparation', 'Rédaction', 'Validation'])
      await expect(page.getByText(station, { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Préparer le jeu de données du trimestre').first()).toBeVisible();
    await expect(page.getByText('Rédiger la note de synthèse').first()).toBeVisible();
  });
});

// Desktop only, as before #67: on an iPhone, Safari shows how to install the app instead.
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
