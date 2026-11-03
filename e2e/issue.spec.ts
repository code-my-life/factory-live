import { expect, test } from '@playwright/test';

test('la ligne ouverte sur une issue montre sous le graphe les runs de la carte au travail, puis sa transcription', async ({
  page,
}) => {
  await page.goto('/issues/claude-cockpit/71');
  await expect(page.getByRole('heading', { level: 2, name: /Vue ÉQUIPE/ })).toBeVisible();
  // The issue is at Implémentation: its implementation card and its running run open.
  // Computer: the table of runs; phone: their cards. Only what is visible counts.
  await expect(page.getByText('#184').filter({ visible: true }).first()).toBeVisible();
  await page
    .getByRole('button', { name: /Transcription/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByRole('link', { name: 'Transcription' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('transcription : la session du plus récent au plus ancien, le terminal ouvert sur la fin', async ({
  page,
}) => {
  await page.goto('/issues/claude-cockpit/71');
  await page
    .getByRole('button', { name: /Transcription/ })
    .filter({ visible: true })
    .first()
    .click();
  const session = page.getByRole('region', { name: /Session Hermès/ });
  const times = await session
    .locator('time')
    .evaluateAll((items) => items.map((item) => item.getAttribute('datetime') ?? ''));
  expect(times.length).toBeGreaterThan(2);
  expect(times).toEqual([...times].sort().reverse());

  // On mobile (< 768px), Terminal is in a dropdown menu
  const viewportWidth = page.viewportSize()?.width ?? 1440;
  if (viewportWidth < 768) {
    // Open the source selector dropdown by clicking the button showing "Session Hermès"
    await page
      .getByRole('button', { name: /Session Hermès/ })
      .first()
      .click();
    // Click Terminal in the dropdown
    await page.getByRole('menuitemradio', { name: 'Terminal' }).click();
  } else {
    // On desktop, Terminal is a direct button
    await page.getByRole('button', { name: 'Terminal' }).click();
  }
  const log = page.getByRole('log', { name: /Log brut du run/ });
  await expect(log).toContainText('2 failing');
  const box = await log.evaluate((element) => ({
    hidden: element.scrollHeight - element.clientHeight,
    fromBottom: element.scrollHeight - element.scrollTop - element.clientHeight,
    height: element.clientHeight,
    viewport: window.innerHeight,
  }));
  expect(box.hidden, 'le log défile dans son cadre').toBeGreaterThan(0);
  expect(box.height).toBeLessThanOrEqual(box.viewport * 0.6 + 1);
  expect(box.fromBottom, 'ouvert sur la fin').toBeLessThanOrEqual(1);
});

test('transcription : les lanes nommées tiennent sur une ligne de 28 px', async ({ page }) => {
  // C8 applies to desktop only (>= 768px). On mobile, the selector is a dropdown.
  const skipMobile = (page.viewportSize()?.width ?? 0) < 768;
  if (skipMobile) return;

  await page.goto('/issues/claude-cockpit/71');
  await page
    .getByRole('button', { name: /Transcription/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByRole('link', { name: 'Transcription' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // Verify the 5 source labels (C1)
  const sourceList = page.getByRole('list', { name: 'Source de la transcription' });
  const sourceButtons = sourceList.getByRole('button');
  await expect(sourceButtons).toHaveCount(5);
  await expect(sourceButtons).toHaveText([
    'Session Hermès',
    'Implémentation',
    'Correction',
    'Correction 2',
    'Terminal',
  ]);

  // Check that the source selector buttons have height 28px (C8: 768 and 1440px)
  for (const width of [1440, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    const box = await sourceList.boundingBox();
    expect(box?.height).toBeCloseTo(28, 0);
    for (const button of await sourceButtons.all()) {
      const buttonBox = await button.boundingBox();
      expect(buttonBox?.height).toBeCloseTo(28, 0);
    }
  }
});
