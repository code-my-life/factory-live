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

/**
 * Les logos de marque (badges, tuiles de la page Santé) se voient : 3:1 au moins entre leur couleur et
 * le fond réel sous eux (fonds translucides des tuiles et des teintes composés jusqu'au premier fond
 * opaque), calculés par le navigateur dans le thème de la page. Rend le nombre de logos vérifiés.
 */
export async function expectVisibleMarks(page: Page): Promise<number> {
  const { count, defects } = await page.evaluate(() => {
    const parse = (value: string) => {
      const [red = 0, green = 0, blue = 0, alpha = 1] = (value.match(/[\d.]+/g) ?? []).map(Number);
      return { red, green, blue, alpha: value.startsWith('rgba') ? alpha : 1 };
    };
    const background = (element: Element): string => {
      const layers: ReturnType<typeof parse>[] = [];
      for (let node: Element | null = element; node; node = node.parentElement) {
        const layer = parse(getComputedStyle(node).backgroundColor);
        if (layer.alpha > 0) layers.push(layer);
        if (layer.alpha >= 1) break;
      }
      let color = { red: 255, green: 255, blue: 255 };
      for (const layer of layers.reverse())
        color = {
          red: layer.red * layer.alpha + color.red * (1 - layer.alpha),
          green: layer.green * layer.alpha + color.green * (1 - layer.alpha),
          blue: layer.blue * layer.alpha + color.blue * (1 - layer.alpha),
        };
      return `rgb(${color.red}, ${color.green}, ${color.blue})`;
    };
    const luminance = (value: string) => {
      const { red, green, blue } = parse(value);
      const [r, g, b] = [red, green, blue].map((channel) => {
        const c = channel / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
    };
    const contrast = (first: string, second: string) => {
      const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
      return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
    };
    const marks = [...document.querySelectorAll('svg[data-mark="brand"]')].filter((mark) =>
      mark.checkVisibility(),
    );
    const found: string[] = [];
    for (const mark of marks) {
      const color = getComputedStyle(mark).color;
      const under = background(mark.parentElement ?? mark);
      const ratio = contrast(color, under);
      if (ratio < 3) found.push(`${ratio.toFixed(2)}:1 (${color} sur ${under})`);
    }
    return { count: marks.length, defects: found };
  });
  expect(defects, 'logos de marque invisibles sur leur fond').toEqual([]);
  return count;
}

/** The colors of a badge's tint, as CSS expressions of Primer's display tokens (the standard of issue #11). */
export function hueTint(hue: string): { frame: string; background: string } {
  return {
    frame: `var(--display-${hue}-borderColor-muted)`,
    background: `var(--display-${hue}-bgColor-muted)`,
  };
}

/**
 * A badge follows the standard: two separate parts (grey label, then value), 20 px high, corners of
 * `borderRadius-medium`, frame and separator of the element's tint, value tinted. The tint is given as
 * CSS color expressions, resolved by the browser in the page's theme.
 */
export async function expectStandardBadge(
  badge: Locator,
  tint: { frame: string; background: string },
): Promise<void> {
  await expect(badge.first()).toBeVisible();
  const facts = await badge.first().evaluate((element, expected) => {
    const resolve = (property: 'color' | 'borderRadius', value: string) => {
      const probe = document.createElement('div');
      probe.style[property] = value;
      document.body.append(probe);
      const resolved = getComputedStyle(probe)[property];
      probe.remove();
      return resolved;
    };
    const label = element.querySelector('[data-segment="label"]');
    const value = element.querySelector('[data-segment="value"]');
    const style = getComputedStyle(element);
    return {
      parts: [label, value].map((part) => part?.getBoundingClientRect().width ?? 0),
      width: element.getBoundingClientRect().width,
      frameWidth:
        Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth),
      height: element.getBoundingClientRect().height,
      radius: style.borderTopLeftRadius,
      expectedRadius: resolve('borderRadius', 'var(--borderRadius-medium)'),
      frame: style.borderTopColor,
      expectedFrame: resolve('color', expected.frame),
      separator: label ? getComputedStyle(label).borderRightColor : null,
      valueBackground: value ? getComputedStyle(value).backgroundColor : null,
      expectedBackground: resolve('color', expected.background),
      labelBackground: label ? getComputedStyle(label).backgroundColor : null,
      neutralBackground: resolve('color', 'var(--bgColor-neutral-muted)'),
    };
  }, tint);
  const name = (await badge.first().getAttribute('title')) ?? 'badge';
  expect(facts.parts[0], `${name} : étiquette`).toBeGreaterThan(0);
  expect(facts.parts[1], `${name} : valeur`).toBeGreaterThan(0);
  expect(facts.height, `${name} : hauteur`).toBeCloseTo(20, 0);
  // The badge keeps the width of its content (never stretched by a flex column): label + value + frame.
  expect(
    Math.abs(facts.width - (facts.parts[0] ?? 0) - (facts.parts[1] ?? 0) - facts.frameWidth),
    `${name} : largeur du badge (${facts.width} px) = étiquette + valeur + cadre`,
  ).toBeLessThanOrEqual(1);
  expect(facts.radius, `${name} : coins`).toBe(facts.expectedRadius);
  expect(facts.frame, `${name} : cadre`).toBe(facts.expectedFrame);
  expect(facts.separator, `${name} : séparateur`).toBe(facts.expectedFrame);
  expect(facts.valueBackground, `${name} : valeur teintée`).toBe(facts.expectedBackground);
  expect(facts.labelBackground, `${name} : étiquette grise`).toBe(facts.neutralBackground);
}

/** A badge stays on one line: 20 px high, whatever the room. */
export async function expectOneLine(badge: Locator): Promise<void> {
  await expect(badge.first()).toBeVisible();
  for (const element of await badge.all()) {
    const box = await element.boundingBox();
    expect(box?.height ?? 0, (await element.getAttribute('title')) ?? 'badge').toBeCloseTo(20, 0);
  }
}

/**
 * A model badge cut in the middle stays readable whatever the room: its head keeps at least one
 * character and the ellipsis, its tail stays whole (its right edge does not pass the value's), and the
 * badge stays 20 px high. Returns the name of the checked badge.
 */
export async function expectReadableCut(badge: Locator): Promise<string> {
  await expect(badge.first()).toBeVisible();
  const name = (await badge.first().getAttribute('title')) ?? 'badge';
  const facts = await badge.first().evaluate((element) => {
    const head = element.querySelector('[data-part="head"]');
    const tail = element.querySelector('[data-part="tail"]');
    const value = element.querySelector('[data-segment="value"]');
    if (!head || !tail || !value) return null;
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return null;
    const style = getComputedStyle(head);
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const valueStyle = getComputedStyle(value);
    return {
      head: head.getBoundingClientRect().width,
      needed: context.measureText('M…').width,
      tailRight: tail.getBoundingClientRect().right,
      valueInner: value.getBoundingClientRect().right - Number.parseFloat(valueStyle.paddingRight),
      height: element.getBoundingClientRect().height,
    };
  });
  expect(facts, `${name} : tête et fin présentes`).not.toBeNull();
  const measured = facts as NonNullable<typeof facts>;
  expect(measured.head, `${name} : la tête garde un caractère et « … »`).toBeGreaterThanOrEqual(
    measured.needed - 0.5,
  );
  expect(measured.tailRight, `${name} : la fin n’est pas rognée`).toBeLessThanOrEqual(
    measured.valueInner + 0.5,
  );
  expect(measured.height, `${name} : hauteur`).toBeCloseTo(20, 0);
  return name;
}
