import { expect, test } from '@playwright/test';
import { expectCleanBadges, expectNoHorizontalOverflow, issueJob } from './helpers.ts';

const QWEN = 'Qwen3.5-9B-The-Defiant-Fable-Uncnr-Heretic-plusIQ-TOOLS-NEO-MAX-MTP-Q8_0';

/** Les écrans qui portent des badges, et ce qu'il faut attendre pour qu'ils soient tous dessinés. */
const SCREENS = [
  '/',
  '/issues',
  '/issues/claude-cockpit/71',
  '/issues/claude-cockpit/68',
  '/interventions/iv-projects',
  '/agents',
  '/costs',
  '/history',
  '/settings',
];

for (const route of SCREENS) {
  test(`badges propres, sans débordement : ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await expectCleanBadges(page), 'des badges sur cet écran').toBeGreaterThan(0);
    await expectNoHorizontalOverflow(page);
  });
}

test('les onglets d’une issue gardent des badges propres', async ({ page }) => {
  await page.goto('/issues/claude-cockpit/68');
  for (const tab of ['PR et CI', 'Coûts', 'Transcription']) {
    const link = page.getByRole('link', { name: tab, exact: true });
    await link.click();
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expectCleanBadges(page);
    await expectNoHorizontalOverflow(page);
  }
});

test('un modèle de 70 caractères est tronqué proprement, son nom entier reste lu', async ({
  page,
}) => {
  await page.goto('/');
  // coder-claude, en lane CLI, passe en tête de « En ce moment » ; son pilote tourne sur le modèle local.
  const card = page.getByRole('region', { name: 'En ce moment' }).getByRole('listitem').first();
  const live = card.locator('[data-badge]', { hasText: QWEN });
  await expect(live).toBeVisible();
  await expect(live).toHaveAttribute('title', new RegExp(`^${QWEN} via llama\\.cpp`));
  const value = live.locator('[data-segment="value"] > span');
  const { truncated, ellipsis } = await value.evaluate((element) => ({
    truncated: element.scrollWidth > element.clientWidth,
    ellipsis: getComputedStyle(element).textOverflow === 'ellipsis',
  }));
  expect(truncated, 'le nom ne tient pas : il est tronqué').toBe(true);
  expect(ellipsis).toBe(true);
  const [badgeBox, cardBox] = [await live.boundingBox(), await card.boundingBox()];
  expect((badgeBox?.x ?? 0) + (badgeBox?.width ?? 0)).toBeLessThanOrEqual(
    (cardBox?.x ?? 0) + (cardBox?.width ?? 0),
  );
});

test('sur la page Agents, le nom long passe à la ligne au lieu d’être tronqué', async ({
  page,
}) => {
  await page.goto('/agents');
  const chain = page.getByRole('article', { name: 'coder-claude' }).getByRole('listitem').first();
  const value = chain.locator('[data-segment="value"] > span');
  await expect(value).toHaveText(QWEN);
  expect(await value.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test('une issue a le même badge partout : ligne, liste, page, activité', async ({ page }) => {
  await page.goto('/');
  await expect(issueJob(page, 'claude-cockpit#71').locator('[data-badge]').first()).toHaveAttribute(
    'title',
    'claude-cockpit#71',
  );
  await page
    .getByRole('region', { name: 'En ce moment' })
    .getByRole('link', { name: 'claude-cockpit#71' })
    .click();
  await expect(page).toHaveURL(/\/issues\/claude-cockpit\/71$/);
  await expect(page.getByRole('main').locator('header [data-badge]').first()).toHaveAttribute(
    'title',
    'claude-cockpit#71',
  );
  await page.goto('/issues');
  await expect(
    page.getByRole('link', { name: /Vue ÉQUIPE/ }).locator('[data-badge]'),
  ).toHaveAttribute('title', 'claude-cockpit#71');
});

test('un état a la même couleur partout : « Bloquée » est rouge sur la ligne, la liste et l’issue', async ({
  page,
}) => {
  await page.goto('/');
  await expect(issueJob(page, 'cv-site#44').getByText('Bloquée')).toHaveAttribute(
    'data-variant',
    'danger',
  );
  await page.goto('/issues');
  await expect(
    page.getByRole('link', { name: /Pied de page/ }).getByText('Bloquée'),
  ).toHaveAttribute('data-variant', 'danger');
  await page.goto('/issues/cv-site/44');
  await expect(page.getByRole('main').locator('header').getByText('Bloquée')).toHaveAttribute(
    'data-variant',
    'danger',
  );
});

test('la PR d’une issue se lit comme sur GitHub : son état, son numéro, sa CI, en français', async ({
  page,
}) => {
  await page.goto('/issues/claude-cockpit/68');
  const facts = page.locator('dl').first();
  await expect(facts.getByText('Ouverte')).toBeVisible();
  await expect(facts.getByRole('link', { name: '#74' })).toBeVisible();
  await expect(facts.locator('[data-badge]', { hasText: 'réussie' })).toHaveAttribute(
    'data-tone',
    'success',
  );
  await expect(facts).not.toContainText(/\bopen\b|\bsuccess\b/);
});
