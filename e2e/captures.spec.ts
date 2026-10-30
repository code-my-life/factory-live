import { expect, test } from '@playwright/test';
import { pauseMotion } from './helpers.ts';

/*
 * Captures de référence (démo, heure figée, animations coupées), produites et comparées dans l'image
 * officielle de Playwright pour que les polices soient les mêmes partout :
 * `npm run e2e:captures` (voir le RUNBOOK).
 */
// The badge checks (standard, middle cut) live in badges.spec.ts, which also runs under WebKit.
const VIEWS = [
  ['ligne', '/'],
  ['issue', '/issues/claude-cockpit/71'],
  ['reglages', '/settings'],
] as const;

for (const [name, route] of VIEWS) {
  test(`capture : ${name}`, async ({ page }) => {
    await pauseMotion(page);
    await page.clock.setFixedTime(new Date('2026-10-28T18:00:00Z'));
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, animations: 'disabled' });
  });
}
