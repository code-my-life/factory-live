import { expect, test } from '@playwright/test';
import {
  expectCleanBadges,
  expectNoHorizontalOverflow,
  expectReadablePaint,
  expectVisibleMarks,
  issueJob,
} from './helpers.ts';

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

/**
 * Les deux langues de l'interface : les mots anglais sont parfois plus longs, les badges doivent
 * rester propres dans l'une comme dans l'autre. Les onglets d'une issue qui portent des badges.
 */
const LANGUAGES = [
  { locale: 'fr-FR', lang: 'fr', name: 'français', tabs: ['PR et CI', 'Coûts', 'Transcription'] },
  { locale: 'en-US', lang: 'en', name: 'anglais', tabs: ['PR and CI', 'Costs', 'Transcript'] },
];

for (const { locale, lang, name, tabs } of LANGUAGES) {
  test.describe(`en ${name}`, () => {
    test.use({ locale });

    for (const route of SCREENS) {
      test(`badges propres, sans débordement : ${route}`, async ({ page }) => {
        await page.goto(route);
        await expect(page.locator('html')).toHaveAttribute('lang', lang);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        expect(await expectCleanBadges(page), 'des badges sur cet écran').toBeGreaterThan(0);
        await expectNoHorizontalOverflow(page);
      });
    }

    test('les onglets d’une issue gardent des badges propres', async ({ page }) => {
      await page.goto('/issues/claude-cockpit/68');
      for (const tab of tabs) {
        const link = page.getByRole('link', { name: tab, exact: true });
        await link.click();
        await expect(link).toHaveAttribute('aria-current', 'page');
        await expectCleanBadges(page);
        await expectNoHorizontalOverflow(page);
      }
    });
  });
}

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

test.describe('en anglais', () => {
  test.use({ locale: 'en-US' });

  test('la PR d’une issue se lit en anglais : son état, son numéro, sa CI', async ({ page }) => {
    await page.goto('/issues/claude-cockpit/68');
    const facts = page.locator('dl').first();
    await expect(facts.getByText('Open', { exact: true })).toBeVisible();
    await expect(facts.getByRole('link', { name: '#74' })).toBeVisible();
    await expect(facts.locator('[data-badge]', { hasText: 'passing' })).toHaveAttribute(
      'data-tone',
      'success',
    );
    await expect(facts).not.toContainText(/réussie|Ouverte/);
  });
});

for (const scheme of ['dark', 'light'] as const) {
  test(`les segments peints restent lisibles, thème ${scheme === 'dark' ? 'sombre' : 'clair'}`, async ({
    page,
  }) => {
    await page.addInitScript((value) => {
      localStorage.setItem('factory-live:color-mode', value);
    }, scheme);
    let count = 0;
    for (const route of ['/', '/issues', '/issues/claude-cockpit/68', '/agents', '/history']) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      count += await expectReadablePaint(page);
    }
    expect(count, 'des étiquettes de marque et des états peints').toBeGreaterThan(5);
  });
}

test('un modèle porte le logo de son éditeur et les couleurs de son fournisseur', async ({
  page,
}) => {
  await page.goto('/');
  const now = page.getByRole('region', { name: 'En ce moment' });
  const qwen = now.locator('[data-badge]', { hasText: QWEN });
  await expect(qwen.locator('[data-segment="label"] svg')).toBeVisible();
  await expect(qwen.locator('[data-segment="value"] svg')).toBeVisible();
  await expect(
    now.locator('[data-badge]', { hasText: 'claude-opus-5-5' }).locator('[data-segment="label"]'),
  ).toHaveAttribute('data-brand', 'Claude');
  await expect(
    now.locator('[data-badge]', { hasText: 'nemotron-3-super' }).locator('[data-segment="label"]'),
  ).toHaveAttribute('data-brand', 'NVIDIA');
});

test('un modèle a son badge partout : écarts de configuration, historique', async ({ page }) => {
  await page.goto('/agents');
  const drift = page
    .getByRole('article', { name: 'coder-claude' })
    .getByRole('region', { name: 'Dérive de configuration' });
  await expect(drift.locator('[data-badge]', { hasText: QWEN })).toBeVisible();
  await expect(drift.locator('[data-badge]', { hasText: 'agnes-2.5-flash' })).toBeVisible();
  await page.goto('/history');
  const gate = page.getByRole('table', { name: 'Passage en gate du premier coup' });
  const rows = gate.getByRole('row').filter({ has: page.getByRole('cell') });
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all())
    await expect(row.getByRole('cell').nth(1).locator('[data-badge]')).toBeVisible();
});

test('la CI se peint de sa couleur franche, avec le logo de GitHub Actions', async ({ page }) => {
  await page.goto('/issues/claude-cockpit/68');
  const ci = page.locator('dl').first().locator('[data-badge]', { hasText: 'réussie' });
  await expect(ci).toHaveAttribute('data-solid', '');
  await expect(ci.locator('[data-segment="label"] svg')).toBeVisible();
});

test('une issue porte l’icône de GitHub à la couleur de son état', async ({ page }) => {
  await page.goto('/issues');
  await expect(
    page.getByRole('link', { name: /Page Projets/ }).locator('[data-segment="label"]'),
  ).toHaveAttribute('data-icon-tone', 'success');
  await page.goto('/history');
  await expect(
    page
      .getByRole('table', { name: 'Dernières issues terminées' })
      .locator('[data-segment="label"][data-icon-tone="done"]')
      .first(),
  ).toBeVisible();
  // Sur la ligne, la tête de la boîte montre déjà l'état : le badge de l'issue s'en passe.
  await page.goto('/');
  await expect(issueJob(page, 'cv-site#49').locator('[data-segment="label"] svg')).toHaveCount(0);
});

for (const scheme of ['dark', 'light'] as const) {
  test(`page Santé : chaque service a son icône, logos visibles, thème ${scheme === 'dark' ? 'sombre' : 'clair'}`, async ({
    page,
  }) => {
    await page.addInitScript((value) => {
      localStorage.setItem('factory-live:color-mode', value);
    }, scheme);
    await page.goto('/health');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const main = page.getByRole('main');
    const tiles = main.getByRole('listitem').filter({ has: page.locator('p svg') });
    const all = main.getByRole('listitem');
    await expect(all.first()).toBeVisible();
    expect(await tiles.count(), 'une icône sur chaque tuile').toBe(await all.count());
    expect(await expectVisibleMarks(page), 'des logos de marque').toBeGreaterThan(3);
    await expectNoHorizontalOverflow(page);
  });
}

test('un même service a la même image partout : GitHub et ses webhooks, NVIDIA', async ({
  page,
}) => {
  await page.goto('/health');
  const logo = (name: string) =>
    page
      .getByRole('main')
      .getByRole('listitem')
      .filter({ hasText: name })
      .locator('svg[data-mark="brand"] path');
  const github = await logo('API GitHub').getAttribute('d');
  expect(github).toBeTruthy();
  await expect(logo('Webhooks GitHub')).toHaveAttribute('d', github ?? '');
  const nvidia = await logo('API NVIDIA').getAttribute('d');
  await page.goto('/');
  await expect(
    page
      .getByRole('region', { name: 'En ce moment' })
      .locator('[data-brand="NVIDIA"] svg path')
      .first(),
  ).toHaveAttribute('d', nvidia ?? '');
  expect(await expectVisibleMarks(page)).toBeGreaterThan(0);
});
