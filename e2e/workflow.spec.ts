import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, issueJob, stationJobs } from './helpers.ts';

/*
 * The screen of a generic workflow (#65), on the demo's made-up workflow `essai`: three stations of
 * three kinds, five items (one blocked, one with a 200-character title), one declared data of each
 * generic type. `?etat=` puts the demo in a state to check (no item, sheet refused).
 */

test('un workflow déclaré au socle s’affiche avec ses stations et ses éléments', async ({
  page,
}) => {
  await page.goto('/');
  // Its entry in the navigation: on the side on a computer, in « Plus » on a phone.
  const side = page.getByRole('navigation', { name: 'Navigation principale' });
  if (await side.isVisible()) await side.getByRole('link', { name: /essai/ }).click();
  else {
    await page
      .getByRole('navigation', { name: 'Navigation' })
      .getByRole('button', { name: 'Plus' })
      .click();
    await page.getByRole('menuitem', { name: 'essai' }).click();
  }
  await expect(page).toHaveURL(/\/workflows\/essai$/);
  await expect(page.getByRole('heading', { level: 1, name: 'essai' })).toBeVisible();

  // One box per station of the sheet (and the standard providers' box), one row per item at its station.
  for (const station of ['preparation', 'redaction', 'validation'])
    await expect(stationJobs(page, station)).toBeVisible();
  for (const [station, item] of [
    ['preparation', 'e_0001'],
    ['redaction', 'e_0002'],
    ['redaction', 'e_0003'],
    ['validation', 'e_0004'],
    ['validation', 'e_0005'],
  ] as const)
    await expect(stationJobs(page, station).locator(`[data-issue="${item}"]`)).toHaveCount(1);
});

test('le détail d’un élément montre ses cartes et ses données déclarées par type', async ({
  page,
}) => {
  await page.goto('/workflows/essai/e_0002');
  const detail = page.getByRole('article');
  await expect(
    detail.getByRole('heading', { level: 2, name: 'Rédiger la note de synthèse' }),
  ).toBeVisible();

  // Its two cards and their runs, with the runs' table of an issue's page.
  await expect(detail.getByRole('heading', { name: '2 cartes' })).toBeVisible();
  await expect(detail.getByText('t_e0002a', { exact: true }).first()).toBeVisible();
  await expect(
    detail.getByText('Quel seuil de tolérance retenir pour les écarts : 2 % ou 5 % ?').first(),
  ).toBeVisible();

  // Its four declared data, each by its type: status, table, text, link.
  const data = detail.getByRole('region', { name: 'Données déclarées' });
  await expect(data.getByText('Deux écarts au-delà de 5 %')).toBeVisible();
  await expect(data.getByRole('table', { name: 'Écarts' })).toBeVisible();
  await expect(data.locator('pre')).toContainText('Synthèse provisoire');
  const link = data.getByRole('link', { name: 'Jeu de données' });
  await expect(link).toHaveAttribute('href', /workflow-essai/);
  expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  // The last run's transcript, open; another run's opens from its button.
  await expect(detail.getByRole('heading', { name: 'Transcription du run #38' })).toBeVisible();
  await detail
    .getByRole('button', { name: /Transcription/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(detail.getByRole('heading', { name: 'Transcription du run #37' })).toBeVisible();
  await expect(detail.getByRole('table', { name: 'Session de l’agent' })).toBeVisible();

  // Its activity, each event named as the core publishes it.
  await expect(detail.getByText('blocked', { exact: true })).toBeVisible();
});

test('sans défilement horizontal à 390 et 1440 px, un titre long coupé sur une ligne', async ({
  page,
}) => {
  for (const route of ['/workflows/essai', '/workflows/essai/e_0002', '/workflows/essai/e_0003']) {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1, name: 'essai' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
  // The 200-character title: one line of the height of the others, its ellipsis shown.
  const long = issueJob(page, 'e_0003').locator('[class*="rowTitle"]').first();
  const short = issueJob(page, 'e_0002').locator('[class*="rowTitle"]').first();
  const [longBox, shortBox] = await Promise.all([long.boundingBox(), short.boundingBox()]);
  expect(Math.round(longBox?.height ?? 0)).toBe(Math.round(shortBox?.height ?? -1));
  expect(
    await long.evaluate((element) => ({
      overflow: getComputedStyle(element).textOverflow,
      cut: element.scrollWidth > element.clientWidth,
    })),
  ).toEqual({ overflow: 'ellipsis', cut: true });
});

test('une fiche refusée s’affiche en bannière, aucun élément donne l’état vide', async ({
  page,
}) => {
  await page.goto('/workflows/essai?etat=refusee');
  await expect(
    page.getByText('La fiche de ce workflow est refusée', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('duplicate-station', { exact: false })).toBeVisible();
  // The page keeps its items, as a list.
  await expect(page.getByRole('list', { name: 'Éléments' }).getByRole('listitem')).toHaveCount(5);
  await expectNoHorizontalOverflow(page);

  await page.goto('/workflows/essai?etat=vide');
  await expect(page.getByText('Aucun élément dans ce workflow pour l’instant.')).toBeVisible();

  await page.goto('/workflows/essai?etat=injoignable');
  await expect(page.getByText('Le socle ne répond pas')).toBeVisible();
  await expect(issueJob(page, 'e_0002')).toBeVisible();
});
