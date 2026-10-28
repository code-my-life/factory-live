import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/** La boîte d'une issue sur la ligne : un élément d'une liste d'étape, dont le lien mène à l'issue. */
export function issueJob(page: Page, key: string): Locator {
  const [repo, number] = key.split('#');
  return page
    .getByRole('list', { name: /^Issues à l’étape/ })
    .getByRole('listitem')
    .filter({ has: page.locator(`a[href="/issues/${repo}/${number}"]`) });
}

/** La liste des issues d'une station de la ligne. */
export function stationJobs(page: Page, station: string): Locator {
  return page.getByRole('list', { name: `Issues à l’étape ${station}` });
}

/** Aucune page ne doit défiler de côté (débordement d'un titre, d'un chemin, d'un tableau). */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'débordement horizontal (px)').toBeLessThanOrEqual(0);
}

/** Coupe les animations en boucle (préférence de l'app), pour des captures stables. */
export async function pauseMotion(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('factory-live:motion', 'paused');
  });
}

/**
 * Glisse le doigt vers le haut depuis (x, y) par de vrais événements tactiles (Chromium, CDP) :
 * le défilement passe alors par `touch-action`, comme sur un téléphone.
 */
export async function swipeUp(page: Page, x: number, y: number, distance = 300): Promise<void> {
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 10; step += 1) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y - (distance * step) / 10 }],
    });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
