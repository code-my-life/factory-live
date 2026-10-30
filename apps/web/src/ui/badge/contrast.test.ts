import dark from '@primer/primitives/dist/styleLint/functional/themes/dark.json';
import light from '@primer/primitives/dist/styleLint/functional/themes/light.json';
import { describe, expect, it } from 'vitest';
import {
  BADGE_BACKGROUNDS,
  composite,
  contrast,
  markColors,
  MIN_MARK_CONTRAST,
  MIN_TEXT_CONTRAST,
  markStyle,
  textOn,
} from './contrast.ts';
import { HUES } from './hues.ts';
import { BRAND_MARKS } from './marks.ts';

/** Les jetons d'un thème de Primer, valeurs résolues, tels que `@primer/primitives` les publie. */
function tokens(theme: Readonly<Record<string, { $value?: unknown }>>): (name: string) => string {
  return (name) => {
    const value = theme[name]?.$value;
    if (typeof value !== 'string') throw new Error(`jeton absent : --${name}`);
    return value.toLowerCase();
  };
}

const THEMES = { light: tokens(light), dark: tokens(dark) } as const;
const TONES = ['accent', 'success', 'attention', 'severe', 'danger', 'done'] as const;

describe('contrast', () => {
  it('calcule le rapport de contraste du WCAG', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(contrast('#ffffff', '#777777')).toBeCloseTo(contrast('#777777', '#ffffff'), 10);
  });

  it('pose une couleur translucide sur son fond, comme le navigateur', () => {
    expect(composite('#00000080', '#ffffff')).toBe('#7f7f7f');
    expect(composite('#123456', '#ffffff')).toBe('#123456');
  });
});

describe('textOn', () => {
  it('écrit en blanc ou en noir selon la luminance du fond, comme shields.io', () => {
    expect(textOn('#181717')).toBe('#ffffff');
    expect(textOn('#76b900')).toBe('#000000');
  });

  it('garde au moins 4,5:1 sur la couleur de chaque marque affichée', () => {
    for (const mark of BRAND_MARKS)
      expect(contrast(textOn(mark.hex), mark.hex), mark.title).toBeGreaterThanOrEqual(
        MIN_TEXT_CONTRAST,
      );
  });
});

describe('markColors', () => {
  it('garde la couleur de marque d’une icône là où elle se voit, la couleur du texte ailleurs', () => {
    // GitHub, presque noir : visible sur fond clair, invisible sur fond sombre.
    expect(markColors('#181717', BADGE_BACKGROUNDS.value)).toEqual({
      light: '#181717',
      dark: null,
    });
    // NVIDIA, vert clair : l'inverse.
    expect(markColors('#76b900', BADGE_BACKGROUNDS.value)).toEqual({
      light: null,
      dark: '#76b900',
    });
  });

  it('ne garde une couleur de marque qu’avec au moins 3:1 sur le fond du segment, dans chaque thème', () => {
    for (const mark of BRAND_MARKS)
      for (const segment of ['label', 'value'] as const) {
        const colors = markColors(mark.hex, BADGE_BACKGROUNDS[segment]);
        for (const theme of ['light', 'dark'] as const) {
          const color = colors[theme];
          if (color)
            expect(
              contrast(color, BADGE_BACKGROUNDS[segment][theme]),
              `${mark.title} (${segment}, ${theme})`,
            ).toBeGreaterThanOrEqual(MIN_MARK_CONTRAST);
        }
      }
  });
});

describe('markStyle', () => {
  it('suit le thème par light-dark() quand la couleur ne passe que dans l’un des deux', () => {
    expect(markStyle('#76b900', 'value')).toEqual({ color: 'light-dark(currentColor, #76b900)' });
    expect(markStyle('#d97757', 'value')).toEqual({ color: '#d97757' });
    expect(markStyle('#181717', 'value')).toEqual({ color: 'light-dark(#181717, currentColor)' });
  });
});

describe('les couleurs des badges, dans les deux thèmes de Primer', () => {
  for (const [theme, token] of Object.entries(THEMES)) {
    const page = token('bgColor-default');

    it(`${theme} : les fonds de référence suivent les jetons de Primer`, () => {
      expect(BADGE_BACKGROUNDS.value[theme as 'light' | 'dark']).toBe(page);
      expect(BADGE_BACKGROUNDS.label[theme as 'light' | 'dark']).toBe(
        composite(token('bgColor-neutral-muted'), page),
      );
    });

    it(`${theme} : l’étiquette grise et chaque valeur teintée gardent 4,5:1`, () => {
      const label = composite(token('bgColor-neutral-muted'), page);
      expect(contrast(token('fgColor-muted'), label)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      for (const tone of TONES) {
        const tint = composite(token(`bgColor-${tone}-muted`), page);
        expect(contrast(token('fgColor-default'), tint), tone).toBeGreaterThanOrEqual(
          MIN_TEXT_CONTRAST,
        );
      }
    });

    it(`${theme} : un état en couleur franche garde 4,5:1, texte blanc sur l’aplat du rôle`, () => {
      for (const tone of [...TONES, 'neutral'] as const)
        expect(
          contrast(token('fgColor-onEmphasis'), token(`bgColor-${tone}-emphasis`)),
          tone,
        ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    });
  }
});

/** A GitHub color (`rrggbb`) tinted at `share` over the page background, like `color-mix` in Badge.tsx. */
const tinted = (color: string, share: number, page: string) =>
  composite(`#${color}${Math.round(share * 255).toString(16)}`, page);

// The colors of the labels of the three repos (factory, claude, claude:opus in the demo, the GitHub
// defaults), plus black and white, the two extremes.
const GITHUB_COLORS = [
  '5319e7',
  'd97757',
  'd4c5f9',
  'd73a4a',
  'a2eeef',
  'fbca04',
  '000000',
  'ffffff',
];

describe('les teintes des badges, dans les deux thèmes de Primer', () => {
  for (const [theme, token] of Object.entries(THEMES)) {
    const page = token('bgColor-default');

    it(`${theme} : le texte par défaut garde 4,5:1 sur le fond de la valeur des 19 teintes`, () => {
      expect(HUES).toHaveLength(19);
      for (const hue of HUES)
        expect(
          contrast(
            token('fgColor-default'),
            composite(token(`display-${hue}-bgColor-muted`), page),
          ),
          hue,
        ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    });

    it(`${theme} : le texte par défaut garde 10,2:1 sur une étiquette GitHub teintée à 18 %`, () => {
      for (const color of GITHUB_COLORS) {
        const ratio = contrast(token('fgColor-default'), tinted(color, 0.18, page));
        expect(ratio, color).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
        expect(Math.round(ratio * 10) / 10, color).toBeGreaterThanOrEqual(10.2);
      }
    });
  }
});
