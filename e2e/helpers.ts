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

/** Un défaut de badge relevé dans la page : quel badge, et ce qui ne va pas. */
interface BadgeDefect {
  badge: string;
  defect: string;
}

/**
 * Les badges (ui/badge) de la page sont propres : aucun segment coupé net par le cadre (une valeur
 * trop longue se tronque avec des points de suspension, sur une ou deux lignes), l'étiquette reste
 * entière sur une ligne, et aucun badge ne chevauche un voisin (comparé ligne à ligne : un texte voisin
 * peut passer à la ligne). Les badges cachés (onglet fermé, version téléphone d'un tableau) sont ignorés.
 */
export async function expectCleanBadges(page: Page): Promise<number> {
  const { count, defects } = await page.evaluate(() => {
    const found: BadgeDefect[] = [];
    const visible = (element: Element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && element.checkVisibility();
    };
    const badges = [...document.querySelectorAll('[data-badge]')].filter(visible);
    const intersects = (left: DOMRect, right: DOMRect) =>
      left.left < right.right - 0.5 &&
      right.left < left.right - 0.5 &&
      left.top < right.bottom - 0.5 &&
      right.top < left.bottom - 0.5;
    for (const badge of badges) {
      const name = badge.getAttribute('title') ?? badge.textContent ?? '';
      if (badge.scrollWidth > badge.clientWidth + 1)
        found.push({ badge: name, defect: 'segment coupé net par le cadre' });
      const label = badge.querySelector('[data-segment="label"] > span');
      if (label && badge.getAttribute('data-yields') === 'value') {
        if (label.scrollWidth > label.clientWidth + 1)
          found.push({ badge: name, defect: 'étiquette tronquée' });
        const lineHeight = Number.parseFloat(getComputedStyle(label).lineHeight);
        if (label.getBoundingClientRect().height > lineHeight * 1.5)
          found.push({ badge: name, defect: 'étiquette sur plusieurs lignes' });
      }
      for (const text of badge.querySelectorAll('[data-segment] > span')) {
        const style = getComputedStyle(text);
        if (text.scrollWidth > text.clientWidth + 1 && style.textOverflow !== 'ellipsis')
          found.push({ badge: name, defect: 'valeur tronquée sans points de suspension' });
        const clamp = style.getPropertyValue('-webkit-line-clamp');
        if (text.scrollHeight > text.clientHeight + 1 && (clamp === '' || clamp === 'none'))
          found.push({ badge: name, defect: 'valeur coupée en hauteur sans points de suspension' });
      }
      const box = badge.getBoundingClientRect();
      for (const sibling of badge.parentElement?.children ?? []) {
        if (sibling === badge || !visible(sibling)) continue;
        if ([...sibling.getClientRects()].some((fragment) => intersects(box, fragment)))
          found.push({
            badge: name,
            defect: `chevauche son voisin « ${sibling.textContent?.slice(0, 40) ?? ''} »`,
          });
      }
    }
    return { count: badges.length, defects: found };
  });
  expect(defects, 'badges mal rendus').toEqual([]);
  return count;
}

/**
 * Les segments peints d'une couleur pleine (étiquette aux couleurs d'une marque, état en couleur
 * franche) gardent un texte lisible : 4,5:1 au moins entre la couleur du texte et celle du fond,
 * calculées par le navigateur dans le thème de la page. Rend le nombre de segments vérifiés.
 */
export async function expectReadablePaint(page: Page): Promise<number> {
  const { count, defects } = await page.evaluate(() => {
    const rgb = (value: string) =>
      (value.match(/[\d.]+/g) ?? []).slice(0, 3).map((channel) => Number(channel) / 255);
    const luminance = (value: string) => {
      const [red = 0, green = 0, blue = 0] = rgb(value).map((channel) =>
        channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
      );
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const contrast = (first: string, second: string) => {
      const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
      return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
    };
    const painted = [
      ...document.querySelectorAll(
        '[data-badge] [data-brand], [data-badge][data-solid] [data-segment="value"], [data-solid]:not([data-badge])',
      ),
    ].filter((element) => element.checkVisibility());
    const found: string[] = [];
    for (const element of painted) {
      const style = getComputedStyle(element);
      const ratio = contrast(style.color, style.backgroundColor);
      if (ratio < 4.5)
        found.push(
          `${element.textContent?.trim() ?? ''} : ${ratio.toFixed(2)}:1 (${style.color} sur ${style.backgroundColor})`,
        );
    }
    return { count: painted.length, defects: found };
  });
  expect(defects, 'segments peints illisibles').toEqual([]);
  return count;
}
