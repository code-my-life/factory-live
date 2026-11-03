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

  test('liens et ronds passent au-dessus des cartes et du cadre de la gate, sans texte, une entrée de légende par sorte de lien', async ({
    page,
  }) => {
    const layer = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((element) => Number.parseFloat(getComputedStyle(element).zIndex) || 0);
    const cards = Math.max(await layer('[data-box]'), await layer('[class*="_gateFrame_"]'));
    expect(await layer('[class*="_edges_"]')).toBeGreaterThan(cards);
    expect(await layer('[class*="_ports_"]')).toBeGreaterThan(cards);
    await expect(page.locator('[class*="_edges_"] text, [class*="_ports_"] text')).toHaveCount(0);
    await page.getByRole('button', { name: 'Légende' }).click();
    await expect(
      page.getByRole('list', { name: 'Légende des liens' }).getByRole('listitem'),
    ).toHaveCount(10);
  });

  test('au repos, un lien pâlit à 0,42 sans être rouge ; seuls les liens actifs portent des comètes', async ({
    page,
  }) => {
    const facts = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.color = 'var(--borderColor-danger-emphasis)';
      document.body.append(probe);
      const red = getComputedStyle(probe).color;
      probe.remove();
      const edges = [...document.querySelectorAll('[class*="_edges_"] path[class*="_edge_"]')];
      const active = new Set(
        [...document.querySelectorAll('[data-active-edge]')].map((path) =>
          path.getAttribute('data-active-edge'),
        ),
      );
      const comets = [...document.querySelectorAll('[data-edge]')];
      return {
        edges: edges.length,
        opacities: [...new Set(edges.map((edge) => getComputedStyle(edge).opacity))],
        red: edges.filter((edge) => getComputedStyle(edge).stroke === red).length,
        comets: comets.length,
        stray: comets.filter((comet) => !active.has(comet.getAttribute('data-edge'))).length,
      };
    });
    expect(facts.edges).toBeGreaterThan(20);
    expect(facts.opacities).toEqual(['0.42']);
    expect(facts.red).toBe(0);
    // The open issue's journey runs: comets, all on its active connectors.
    expect(facts.comets).toBeGreaterThan(0);
    expect(facts.stray).toBe(0);
  });

  test('la recherche #71 garde une seule issue de la démo et pâlit les autres à 0,32, sans les déplacer', async ({
    page,
  }) => {
    const other = issueJob(page, 'cv-site#44');
    // Where the row stands in the graph (on a phone, the count line under the filters moves the whole
    // graph down the page, not the row inside it).
    const inGraph = () =>
      other.evaluate((element) => {
        const canvas = element.closest('[class*="_canvas_"]') as HTMLElement;
        const row = element.getBoundingClientRect();
        const origin = canvas.getBoundingClientRect();
        return { x: row.x - origin.x, y: row.y - origin.y };
      });
    const before = await inGraph();
    await page.getByRole('textbox', { name: 'Rechercher une issue' }).fill('#71');
    await expect(page.getByText(/^1 issue sur \d+/)).toBeVisible();
    await expect(issueJob(page, 'claude-cockpit#71')).not.toHaveAttribute('data-dimmed');
    await expect
      .poll(() => other.evaluate((element) => getComputedStyle(element).opacity))
      .toBe('0.32');
    expect(await inGraph()).toEqual(before);
  });

  test('la légende est repliée à l’ouverture et les boutons de zoom restent sous le graphe', async ({
    page,
  }) => {
    await expect(page.getByRole('button', { name: 'Légende' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    const zoom = await page.getByRole('group', { name: 'Zoom du graphe' }).boundingBox();
    const graph = await page.locator('[class*="_viewport_"]').boundingBox();
    expect(zoom).not.toBeNull();
    expect(graph).not.toBeNull();
    expect(zoom?.y ?? 0).toBeGreaterThanOrEqual((graph?.y ?? 0) + (graph?.height ?? 0) - 0.5);
  });

  test('sur téléphone, « T’attend », la recherche et les filtres s’empilent : recherche sur toute la largeur, filtres à gauche', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'mise en page de moins de 768 px');
    const head = await page.locator('header[class*="_panelHead_"]').boundingBox();
    const waits = await page.locator('header[class*="_panelHead_"] p').first().boundingBox();
    const search = await page.locator('[class*="_search_"]').boundingBox();
    const type = await page.getByRole('button', { name: 'Type', exact: true }).boundingBox();
    expect(head && waits && search && type).toBeTruthy();
    if (!head || !waits || !search || !type) return;
    expect(search.y).toBeGreaterThanOrEqual(waits.y + waits.height - 0.5);
    expect(type.y).toBeGreaterThanOrEqual(search.y + search.height - 0.5);
    // The header's padding is 16 px on each side: the search takes all the rest.
    expect(search.width).toBeGreaterThanOrEqual(head.width - 2 * 16 - 1);
    expect(Math.abs(type.x - search.x)).toBeLessThanOrEqual(1);
  });

  test('un lien vers une issue ouvre la ligne sur elle, ses détails dessous ; plus d’entrée Issues ni d’activité', async ({
    page,
  }) => {
    await page.goto('/issues/claude-cockpit/68');
    await expect(issueJob(page, 'claude-cockpit#68')).toHaveAttribute('data-selected', '');
    await expect(
      page.getByRole('heading', { level: 2, name: /Tag automatique des versions/ }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Issues', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /^(Activité|Voie annexe)$/ })).toHaveCount(0);
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
