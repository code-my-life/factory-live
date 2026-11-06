import { readFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

/**
 * The detail of a video whose master exists, on the live build: the studio is served by `page.route`
 * (the fake API serves no workflow), and its master is a real MP4 of 1440 × 2560. Without a bound,
 * the player's column took the master's natural width and left the script 0 px (#41).
 */
const ID = 'vitrine-factory-live';
const AT = `/api/workflows/studio/items/${ID}`;
const MASTER = 'e2e/fixtures/master-1440x2560.mp4';
const SHEET = (
  JSON.parse(readFileSync('fixtures/workflow-studio-v1/workflow.json', 'utf8')) as {
    sheet: unknown;
  }
).sheet;

const ITEM = {
  id: ID,
  card: 't_0001',
  title: 'Vitrine de factory-live',
  station: 'revue',
  state: 'waiting',
  since: '2026-11-06T08:00:00Z',
  waits: 'Regarder le master',
  failure: null,
};

// Long words too: a word cut by the column would break over several lines.
const TEXT =
  'Bonjour, voici factory-live : une usine logicielle qui transforme chaque issue en pull request ' +
  'vérifiée, avec ses preuves, ses tests automatisés et sa recette intégralement documentée.';
const WORDS = TEXT.split(' ').map((mot, index) => ({
  mot,
  debut: index * 0.5,
  fin: index * 0.5 + 0.4,
  garde: true,
}));

async function serveStudio(page: Page): Promise<void> {
  await page.route('**/api/workflows/studio', (route) =>
    route.fulfill({
      json: { sheet: SHEET, sheetError: null, items: [ITEM], unreachableSince: null, error: null },
    }),
  );
  await page.route(`**${AT}`, (route) =>
    route.fulfill({
      json: {
        ...ITEM,
        script: TEXT,
        steps: [],
        files: [{ kind: 'video', name: 'master.mp4', url: `${AT}/media/master.mp4` }],
        links: {},
      },
    }),
  );
  await page.route(`**${AT}/words`, (route) => route.fulfill({ json: { words: WORDS } }));
  await page.route(`**${AT}/media/master.mp4`, (route) =>
    route.fulfill({ path: MASTER, contentType: 'video/mp4' }),
  );
}

interface Layout {
  columns: number[];
  section: { left: number; width: number };
  player: { top: number; right: number; bottom: number };
  script: { top: number; left: number; width: number };
  /** Words of the script drawn over more than one line. */
  broken: string[];
}

/** The grid of the player and the script, once the master's dimensions are read. */
async function layout(page: Page): Promise<Layout> {
  const video = page.locator('video');
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.videoWidth))
    .toBe(1440);
  await expect(page.locator('button[data-start]')).toHaveCount(WORDS.length);
  return video.evaluate((element) => {
    const section = element.closest('section') as HTMLElement;
    const player = element.parentElement as HTMLElement;
    const script = section.children[1] as HTMLElement;
    const box = (node: Element) => node.getBoundingClientRect();
    return {
      columns: getComputedStyle(section)
        .gridTemplateColumns.split(' ')
        .map((size) => Number.parseFloat(size)),
      section: { left: box(section).left, width: box(section).width },
      player: { top: box(player).top, right: box(player).right, bottom: box(player).bottom },
      script: { top: box(script).top, left: box(script).left, width: box(script).width },
      broken: [...script.querySelectorAll('button[data-start]')]
        .filter((word) => word.getClientRects().length !== 1)
        .map((word) => word.textContent ?? ''),
    };
  });
}

test('avec un vrai master de 1440 × 2560, le script garde sa colonne à côté du lecteur', async ({
  page,
}) => {
  await serveStudio(page);
  await page.goto(`/studio/${ID}`);

  for (const { width, height, script } of [
    { width: 1440, height: 900, script: 800 },
    // The app's content is capped at 1480 px (AppShell), so the script tops out near 1092 px.
    { width: 1920, height: 1080, script: 1080 },
  ]) {
    await page.setViewportSize({ width, height });
    const at = await layout(page);
    expect(at.columns, `${width} × ${height}`).toHaveLength(2);
    const [playerColumn = 0, scriptColumn = 0] = at.columns;
    expect(playerColumn, `${width} × ${height}`).toBeLessThanOrEqual(340);
    expect(scriptColumn, `${width} × ${height}`).toBeGreaterThanOrEqual(script);
    expect(at.script.left, `${width} × ${height}`).toBeGreaterThanOrEqual(at.player.right);
    expect(Math.abs(at.script.top - at.player.top), `${width} × ${height}`).toBeLessThanOrEqual(1);
    expect(at.broken, `${width} × ${height}`).toEqual([]);
  }
});

test('sur iPhone, avec un vrai master, le script reste sous le lecteur', async ({ page }) => {
  await serveStudio(page);
  await page.goto(`/studio/${ID}`);

  const at = await layout(page);
  expect(at.columns).toHaveLength(1);
  expect(at.script.top).toBeGreaterThanOrEqual(at.player.bottom);
  expect(Math.abs(at.script.width - at.section.width)).toBeLessThanOrEqual(1);
  expect(at.broken).toEqual([]);
});
