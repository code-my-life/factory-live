import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  expectCleanBadges,
  expectNoHorizontalOverflow,
  expectOneLine,
  expectReadableCut,
  expectReadablePaint,
  expectStandardBadge,
  expectVisibleMarks,
  hueTint,
  issueJob,
  pauseMotion,
} from './helpers.ts';

const QWEN = 'Qwen3.5-9B-The-Defiant-Fable-Uncnr-Heretic-plusIQ-TOOLS-NEO-MAX-MTP-Q8_0';
const NEMOTRON = 'nvidia/nemotron-3-ultra-550b-a55b';

/** The badge of a type (its label word) inside a scope, narrowed by its value. */
function badge(page: Page, scope: Locator, word: string, value: string): Locator {
  return scope
    .locator('[data-badge]')
    .filter({ has: page.locator('[data-segment="label"]', { hasText: new RegExp(`^${word}$`) }) })
    .filter({ has: page.locator('[data-segment="value"]', { hasText: value }) });
}

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
  // Cut in the middle: the head gives way (ellipsis), the last segments stay whole.
  const [, head, tail] = await live.locator('[data-segment="value"] [data-split] > span').all();
  const { truncated, ellipsis } = await (head as Locator).evaluate((element) => ({
    truncated: element.scrollWidth > element.clientWidth,
    ellipsis: getComputedStyle(element).textOverflow === 'ellipsis',
  }));
  expect(truncated, 'le nom ne tient pas : son début est tronqué').toBe(true);
  expect(ellipsis).toBe(true);
  await expect(tail as Locator).toHaveText('-MTP-Q8_0');
  expect(
    await (tail as Locator).evaluate((element) => element.scrollWidth <= element.clientWidth),
    'la fin du nom reste entière',
  ).toBe(true);
  const [badgeBox, cardBox] = [await live.boundingBox(), await card.boundingBox()];
  expect((badgeBox?.x ?? 0) + (badgeBox?.width ?? 0)).toBeLessThanOrEqual(
    (cardBox?.x ?? 0) + (cardBox?.width ?? 0),
  );
});

test('sur la page Agents, le nom long reste sur une ligne, coupé au milieu', async ({ page }) => {
  await page.goto('/agents');
  const chain = page.getByRole('article', { name: 'coder-claude' }).getByRole('listitem').first();
  const badge = chain.locator('[data-badge]');
  await expect(badge).toHaveAttribute('title', new RegExp(`^${QWEN}`));
  const box = await badge.boundingBox();
  expect(box?.height, 'un badge ne passe jamais à la ligne').toBeCloseTo(20, 0);
  await expect(badge.locator('[data-split] > span').nth(2)).toHaveText('-MTP-Q8_0');
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
    // The row now also carries the station badge: the issue badge comes first.
    page
      .getByRole('link', { name: /Vue ÉQUIPE/ })
      .locator('[data-badge]')
      .first(),
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

test('une intervention a la même couleur partout : rouge quand elle bloque, jaune sinon', async ({
  page,
}) => {
  // cv-site#49 : « Carte UI sans maquette jointe », bloquante ; cv-site#44 : carte retenue, à traiter.
  await page.goto('/');
  await expect(
    issueJob(page, 'cv-site#49').getByText('Carte UI sans maquette jointe'),
  ).toHaveAttribute('data-tone', 'danger');
  await page.goto('/interventions');
  const list = page.getByRole('navigation', { name: 'Interventions en attente' });
  await expect(list.getByRole('link', { name: /cv-site#49/ })).toHaveAttribute(
    'data-tone',
    'danger',
  );
  await expect(list.getByRole('link', { name: /cv-site#44/ })).toHaveAttribute(
    'data-tone',
    'attention',
  );
  await expect(page.getByText('Bloquant', { exact: true })).toHaveAttribute(
    'data-variant',
    'danger',
  );
  await page.goto('/issues/cv-site/49');
  await expect(
    page.locator('[data-variant="critical"]').getByText(/Carte UI sans maquette jointe/),
  ).toBeVisible();
  await page.goto('/issues/cv-site/44');
  await expect(page.locator('[data-variant="warning"]').getByRole('button')).toBeVisible();
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

test('la CI teinte sa valeur de la couleur de l’état, avec le logo de GitHub Actions', async ({
  page,
}) => {
  await page.goto('/issues/claude-cockpit/68');
  const ci = page.locator('dl').first().locator('[data-badge]', { hasText: 'réussie' });
  await expect(ci).not.toHaveAttribute('data-solid');
  await expect(ci).toHaveAttribute('data-tone', 'success');
  await expect(ci.locator('[data-segment="label"] svg')).toBeVisible();
});

test('une issue porte l’icône de GitHub à la couleur de son état', async ({ page }) => {
  await page.goto('/issues');
  await expect(
    page
      .getByRole('link', { name: /Page Projets/ })
      .locator('[data-segment="label"]')
      .first(),
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

/*
 * The standard of the badges (issue #11), on the screens of the captures, in both themes: two separate
 * parts, 20 px high, corners of `borderRadius-medium`, frame of the element's hue, the width of the content.
 * (The reference captures themselves stay in captures.spec.ts.)
 */
for (const scheme of ['light', 'dark'] as const) {
  test.describe(`badges, thème ${scheme === 'dark' ? 'sombre' : 'clair'}`, () => {
    test.beforeEach(async ({ page }) => {
      await pauseMotion(page);
      await page.addInitScript((value) => {
        localStorage.setItem('factory-live:color-mode', value);
      }, scheme);
    });

    test('l’écran d’une issue avec PR : issue, poste, agent, PR, CI et étiquette GitHub', async ({
      page,
    }) => {
      await page.goto('/issues/claude-cockpit/68');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const main = page.getByRole('main');
      const header = main.locator('header');
      const facts = main.locator('dl').first();
      // The repo's hue: issue and PR; the station's hue: release; the agent's: coder.
      await expectStandardBadge(
        header.locator('[data-badge][title="claude-cockpit#68"]'),
        hueTint('coral'),
      );
      await expectStandardBadge(badge(page, header, 'poste', 'Release'), hueTint('coral'));
      await expectStandardBadge(badge(page, facts, 'agent', 'coder'), hueTint('green'));
      await expectStandardBadge(facts.locator('[data-badge][title="#74"]'), hueTint('coral'));
      await expectStandardBadge(badge(page, facts, 'CI', 'réussie'), {
        frame: 'var(--borderColor-success-muted)',
        background: 'var(--bgColor-success-muted)',
      });
      // The GitHub label keeps its own color: 18 % on the value, 45 % on the frame.
      const label = badge(page, header, 'étiquette', 'factory');
      await expectStandardBadge(label, {
        frame: 'color-mix(in srgb, #5319e7 45%, var(--bgColor-default))',
        background: 'color-mix(in srgb, #5319e7 18%, var(--bgColor-default))',
      });
    });

    test('l’écran Agents : skill, toolset, plugin, serveur MCP, effort et modèle', async ({
      page,
    }) => {
      await page.goto('/agents');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const card = page.getByRole('article', { name: 'coordinator', exact: true });
      await expectStandardBadge(badge(page, card, 'skill', 'factory-brief'), hueTint('indigo'));
      await expectStandardBadge(badge(page, card, 'toolset', 'kanban'), hueTint('blue'));
      await expectStandardBadge(
        badge(page, card, 'plugin', 'coordinator-guard'),
        hueTint('indigo'),
      );
      await expectStandardBadge(badge(page, card, 'MCP', 'graphify'), hueTint('pink'));
      await expectStandardBadge(badge(page, card, 'effort', 'high'), hueTint('indigo'));
      await expectStandardBadge(badge(page, card, 'MoA', 'mix'), hueTint('plum'));
    });

    test('à la largeur d’un iPhone, les deux longs noms de modèle tiennent sur une ligne', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      for (const route of ['/agents', '/costs']) {
        await page.goto(route);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        for (const name of [QWEN, NEMOTRON])
          await expectOneLine(page.locator('[data-badge]:visible', { hasText: name }));
      }
    });
  });
}

test('à la largeur d’un iPhone, le modèle de la page Coûts reçoit la largeur de sa fiche', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/costs');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const qwen = page.locator('[data-badge]:visible', { hasText: QWEN }).first();
  await expect(qwen).toBeVisible();
  const box = await qwen.boundingBox();
  expect(box?.width ?? 0, 'largeur du badge Qwen (px)').toBeGreaterThanOrEqual(390 * 0.8);
  await expectNoHorizontalOverflow(page);
});

/** The models of the demo that must show on each screen, whatever its width. */
const MODELS_ON = {
  '/costs': [QWEN, NEMOTRON, 'gpt-oss-20b-MXFP4', 'claude-sonnet-5-5', 'claude-opus-5-5'],
  // The demo shows no Claude model on the Agents screen.
  '/agents': [QWEN, NEMOTRON, 'gpt-oss-20b-MXFP4'],
} as const;

for (const [route, names] of Object.entries(MODELS_ON)) {
  test(`à la largeur d’un iPhone, chaque nom de modèle garde sa tête et sa fin : ${route}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const cut = page.locator('[data-badge]:visible', { has: page.locator('[data-part="head"]') });
    const checked: string[] = [];
    for (const element of await cut.all()) checked.push(await expectReadableCut(element));
    for (const name of names)
      expect(
        checked.some((title) => title.includes(name)),
        `${name} est affiché et coupé proprement`,
      ).toBe(true);
  });
}

test('sur l’écran d’une issue, à la largeur du bureau, le modèle local n’est pas coupé quand la cellule a la place', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/issues/claude-cockpit/71');
  await page.getByRole('link', { name: 'Coûts', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const cell = page.locator('td:visible', { has: page.locator(`[data-badge][title*="${QWEN}"]`) });
  const local = cell.locator(`[data-badge][title*="${QWEN}"]`).first();
  await expect(local).toBeVisible();
  const [cellBox, badgeBox] = [await cell.first().boundingBox(), await local.boundingBox()];
  expect(badgeBox?.width ?? 0, 'le badge n’est plus borné à 280 px').toBeGreaterThan(280);
  expect(badgeBox?.width ?? 0).toBeLessThanOrEqual(cellBox?.width ?? 0);
});
