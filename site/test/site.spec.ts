import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * Le site tel que GitHub Pages le sert (/factory-live/), en bureau et sur téléphone : rien ne
 * déborde, chaque lien mène quelque part, les onglets et la glissière marchent, la démo s'ouvre.
 */
const PAGES = [
  {
    path: '',
    lang: 'en',
    cta: 'Try the live demo',
    other: 'Français',
    otherLang: 'fr',
    demoHeading: 'Factory line',
  },
  {
    path: 'fr/',
    lang: 'fr',
    cta: 'Essayer la démo',
    other: 'English',
    otherLang: 'en',
    demoHeading: 'Ligne d’usine',
  },
] as const;

/** Erreurs de la page : console, exceptions, requêtes du site en échec ou en 4xx/5xx. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? 'échec';
    // Une image encore en chargement quand on quitte la page est annulée : ce n'est pas une panne.
    if (/ABORTED|cancel/i.test(reason)) return;
    errors.push(`${request.url()} : ${reason}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  return errors;
}

/** Descend la page écran par écran : les images paresseuses se chargent, les entrées se jouent. */
async function scrollThrough(page: Page): Promise<void> {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const step = (page.viewportSize()?.height ?? 800) / 2;
  for (let top = 0; top < height; top += step) {
    await page.evaluate((y) => window.scrollTo(0, y), top);
    await page.waitForTimeout(40);
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(700);
}

/**
 * Les éléments qui sortent de l'écran par le côté. Un élément coupé exprès par un parent
 * (`overflow` autre que visible : la scène du héros, les tuiles, un bloc de code) n'est pas compté ;
 * ce parent, lui, l'est.
 */
async function sideOverflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const clipped = (element: Element) => {
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (parent === document.body || parent === document.documentElement) return false;
        if (getComputedStyle(parent).overflowX !== 'visible') return true;
      }
      return false;
    };
    const offenders: string[] = [];
    for (const element of document.body.querySelectorAll('*')) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || clipped(element)) continue;
      if (rect.right > width + 1 || rect.left < -1) {
        offenders.push(
          `${element.tagName.toLowerCase()}.${String(element.className)} (${Math.round(rect.left)} → ${Math.round(rect.right)})`,
        );
      }
    }
    return offenders;
  });
}

/** Bureau, tablette et téléphone : les tailles où une capture doit rester centrée. */
const VIEWPORTS = [
  { name: 'bureau', width: 1440, height: 900 },
  { name: 'tablette', width: 820, height: 1180 },
  { name: 'téléphone', width: 390, height: 844 },
] as const;

/** Écart entre le centre d'un élément et celui de son cadre, en pixels CSS. */
async function centerOffset(page: Page, inner: string, frame: string) {
  return page.evaluate(
    ([innerSelector, frameSelector]) => {
      const box = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`${selector} introuvable`);
        return element.getBoundingClientRect();
      };
      const image = box(innerSelector);
      const outer = box(frameSelector);
      return {
        x: image.left + image.width / 2 - (outer.left + outer.width / 2),
        y: image.top + image.height / 2 - (outer.top + outer.height / 2),
        inside:
          image.left >= outer.left - 1 &&
          image.right <= outer.right + 1 &&
          image.top >= outer.top - 1 &&
          image.bottom <= outer.bottom + 1,
      };
    },
    [inner, frame] as const,
  );
}

for (const site of PAGES) {
  test.describe(`site ${site.lang}`, () => {
    test('les captures d’ordinateur, de tablette et de smartphone sont centrées dans leur cadre', async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(site.path);
        for (const id of ['desktop', 'tablet', 'phone']) {
          await page.locator(`#screen-tab-${id}`).click();
          const image = page.locator(`#screen-${id} img`);
          await expect(image).toBeVisible();
          await expect
            .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
            .toBeGreaterThan(0);
          const offset = await centerOffset(page, `#screen-${id} img`, '.screens-plate');
          const where = `${viewport.name}, onglet ${id}`;
          expect(Math.abs(offset.x), `${where} : écart horizontal (px)`).toBeLessThanOrEqual(1);
          expect(Math.abs(offset.y), `${where} : écart vertical (px)`).toBeLessThanOrEqual(1);
          expect(offset.inside, `${where} : la capture sort de son cadre`).toBe(true);
        }
        if (viewport.width < 768) {
          // Sur téléphone, le héros montre la capture du smartphone, centrée sur sa scène.
          const hero = page.locator('.hero-image');
          await expect
            .poll(() => hero.evaluate((element: HTMLImageElement) => element.currentSrc))
            .toContain('line-phone');
          const offset = await centerOffset(page, '.hero-image', '.hero-stage');
          expect(
            Math.abs(offset.x),
            'téléphone, héros : écart horizontal (px)',
          ).toBeLessThanOrEqual(1);
        }
      }
    });

    test('se charge sans erreur, sans débordement, toutes ses images chargées', async ({
      page,
    }) => {
      const errors = watchErrors(page);
      await page.goto(site.path);
      await expect(page.locator('html')).toHaveAttribute('lang', site.lang);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await scrollThrough(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, 'la page défile de côté').toBeLessThanOrEqual(0);
      expect(await sideOverflow(page), 'éléments hors de l’écran').toEqual([]);
      const broken = await page.evaluate(() =>
        [...document.images]
          .filter((image) => image.offsetParent !== null && image.naturalWidth === 0)
          .map((image) => image.getAttribute('src')),
      );
      expect(broken, 'images non chargées').toEqual([]);
      expect(errors).toEqual([]);
    });

    test('accessibilité (axe, WCAG 2.2 AA)', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(site.path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        results.violations.map(
          (violation) =>
            `${violation.id} : ${violation.help} (${violation.nodes
              .map((node) => node.target.join(' '))
              .slice(0, 3)
              .join(' | ')})`,
        ),
      ).toEqual([]);
    });

    test('chaque lien de la navigation mène à sa section', async ({ page, isMobile }) => {
      await page.goto(site.path);
      const nav = page.getByRole('navigation', {
        name: site.lang === 'fr' ? 'Principale' : 'Main',
      });
      const ids = ['see', 'how', 'start', 'security', 'roadmap'];
      for (const id of ids) {
        if (isMobile) await nav.getByText('Menu').click();
        const links = nav.locator(`a[href="#${id}"]`);
        await links.locator('visible=true').first().click();
        await expect(page.locator(`#${id}`)).toBeInViewport();
      }
    });

    test('les onglets d’écran changent la capture, au clic et au clavier', async ({ page }) => {
      await page.goto(site.path);
      const tabs = page.getByRole('tablist').first().getByRole('tab');
      await expect(tabs).toHaveCount(3);
      await tabs.nth(2).click();
      await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
      const phone = page.locator('#screen-phone img');
      await expect(phone).toBeVisible();
      await expect
        .poll(() => phone.evaluate((image: HTMLImageElement) => image.naturalWidth))
        .toBeGreaterThan(0);
      await expect(page.locator('#screen-desktop')).toBeHidden();
      await tabs.nth(2).focus();
      await page.keyboard.press('ArrowLeft');
      await expect(tabs.nth(1)).toBeFocused();
      await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('#screen-tablet img')).toBeVisible();
    });

    test('la glissière parcourt les quatre étapes et le schéma suit', async ({ page }) => {
      await page.goto(site.path);
      const how = page.locator('#how');
      const range = how.getByRole('slider');
      await expect(how.locator('.stage').first()).toBeVisible();
      await expect(how.locator('.stage').nth(3)).toBeHidden();
      await range.focus();
      await range.press('End');
      await expect(how).toHaveAttribute('data-stage', 'unblock');
      await expect(how.locator('.stage').nth(3)).toBeVisible();
      await expect(how.locator('.stage').first()).toBeHidden();
      await expect(how.locator('.schema-back')).toBeVisible();
      await expect(how.locator('.node[data-node="github"]')).toHaveAttribute('data-active', '');
      await how.locator('.stage-name').nth(1).click();
      await expect(how).toHaveAttribute('data-stage', 'read');
      await expect(range).toHaveValue('2');
    });

    test('les étapes d’installation s’ouvrent une à une', async ({ page }) => {
      await page.goto(site.path);
      const tabs = page.locator('#start').getByRole('tab');
      await expect(tabs).toHaveCount(5);
      await expect(page.locator('#step-tailnet')).toBeHidden();
      await tabs.nth(2).click();
      await expect(page.locator('#step-tailnet')).toBeVisible();
      await expect(page.locator('#step-tailnet code').first()).toContainText('tailscale serve');
      await expect(page.locator('#step-hermes')).toBeHidden();
    });

    test('le lien de langue mène à l’autre page', async ({ page }) => {
      await page.goto(site.path);
      await page.locator('.masthead').getByRole('link', { name: site.other }).click();
      await expect(page.locator('html')).toHaveAttribute('lang', site.otherLang);
    });

    test('le bouton de la démo ouvre la vraie app dans la langue de la page, sans service worker', async ({
      page,
    }) => {
      const errors = watchErrors(page);
      // Le navigateur parle l'autre langue : c'est la page qui choisit celle de la démo.
      await page.addInitScript((lang) => {
        Object.defineProperty(navigator, 'language', { get: () => lang });
      }, site.otherLang);
      await page.goto(site.path);
      await page.getByRole('link', { name: site.cta }).first().click();
      await expect(page).toHaveURL(/\/factory-live\/demo\/$/);
      await expect(page.getByRole('heading', { level: 1, name: site.demoHeading })).toBeVisible();
      const workers = await page.evaluate(async () =>
        'serviceWorker' in navigator
          ? (await navigator.serviceWorker.getRegistrations()).length
          : 0,
      );
      expect(workers).toBe(0);
      expect(errors).toEqual([]);
    });
  });
}

test('une tuile ouvre sa vue dans la démo', async ({ page }) => {
  await page.goto('');
  await page.locator('.tile-intervention').getByRole('link').click();
  await expect(page).toHaveURL(/demo\/#interventions$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Interventions' })).toBeVisible();
});

test.describe('sans script', () => {
  test.use({ javaScriptEnabled: false });

  test('tout reste lisible : écrans, étapes du schéma, étapes d’installation', async ({ page }) => {
    await page.goto('');
    for (const id of ['desktop', 'tablet', 'phone']) {
      await expect(page.locator(`#screen-${id} img`)).toBeVisible();
    }
    await expect(page.locator('#how .stage')).toHaveCount(4);
    for (const stage of await page.locator('#how .stage').all()) await expect(stage).toBeVisible();
    for (const step of await page.locator('#start .step').all()) await expect(step).toBeVisible();
    await expect(page.locator('.tile').last()).toBeVisible();
  });
});

test.describe('mouvement réduit', () => {
  test.use({ reducedMotion: 'reduce' });

  test('rien n’attend une entrée en scène', async ({ page }) => {
    await page.goto('');
    const hidden = await page.evaluate(
      () =>
        [...document.querySelectorAll('[data-reveal]')].filter(
          (element) => getComputedStyle(element).opacity !== '1',
        ).length,
    );
    expect(hidden).toBe(0);
  });
});
