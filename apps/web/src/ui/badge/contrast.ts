import type { CSSProperties } from 'react';

/** Texte : 4,5:1 au moins (WCAG 1.4.3). Icône, élément graphique : 3:1 au moins (WCAG 1.4.11). */
export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_MARK_CONTRAST = 3;

type Theme = 'light' | 'dark';

function rgba(hex: string): [number, number, number, number] {
  const digits = hex.replace('#', '');
  const full = digits.length <= 4 ? [...digits].map((digit) => digit + digit).join('') : digits;
  const byte = (at: number) => Number.parseInt(full.slice(at, at + 2), 16);
  return [byte(0), byte(2), byte(4), full.length === 8 ? byte(6) / 255 : 1];
}

/** Luminance relative du WCAG (sRGB linéarisé). */
function luminance(hex: string): number {
  const linear = (value: number) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  const [red, green, blue] = rgba(hex);
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

/** Rapport de contraste du WCAG entre deux couleurs opaques, de 1 à 21. */
export function contrast(first: string, second: string): number {
  const [light, dark] = [luminance(first), luminance(second)].sort((left, right) => right - left);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

/** Une couleur translucide (`#rrggbbaa`, comme les jetons « muted » de Primer) posée sur un fond opaque. */
export function composite(over: string, under: string): string {
  const [red, green, blue, alpha] = rgba(over);
  const [baseRed, baseGreen, baseBlue] = rgba(under);
  const mix = (top: number, bottom: number) =>
    Math.round(top * alpha + bottom * (1 - alpha))
      .toString(16)
      .padStart(2, '0');
  return `#${mix(red, baseRed)}${mix(green, baseGreen)}${mix(blue, baseBlue)}`;
}

/**
 * Le texte posé sur une couleur de marque : blanc ou noir, celui qui contraste le plus, comme
 * shields.io choisit la couleur du texte d'après la luminance du fond. L'un des deux atteint toujours
 * 4,6:1 au moins, quelle que soit la couleur.
 */
export function textOn(background: string): '#ffffff' | '#000000' {
  return contrast('#ffffff', background) >= contrast('#000000', background) ? '#ffffff' : '#000000';
}

/**
 * Les fonds d'un badge dans chaque thème, pour juger la couleur d'un logo : la valeur sur
 * `--bgColor-default`, l'étiquette sur `--bgColor-neutral-muted` posé dessus. Ce sont les valeurs des
 * jetons de Primer, que le test de contraste compare à `@primer/primitives` : elles ne peuvent pas
 * s'en écarter sans qu'il échoue.
 */
export const BADGE_BACKGROUNDS: Readonly<
  Record<'label' | 'value', Readonly<Record<Theme, string>>>
> = {
  value: { light: '#ffffff', dark: '#0d1117' },
  label: { light: composite('#818b981f', '#ffffff'), dark: composite('#656c7633', '#0d1117') },
};

/**
 * La couleur d'un logo dans chaque thème : sa couleur de marque là où elle se voit (3:1 sur le fond),
 * sinon `null`, et le logo prend la couleur du texte (un logo noir sur fond sombre, par exemple).
 */
export function markColors(
  hex: string,
  backgrounds: Readonly<Record<Theme, string>>,
): Record<Theme, string | null> {
  const keep = (theme: Theme) =>
    contrast(hex, backgrounds[theme]) >= MIN_MARK_CONTRAST ? hex : null;
  return { light: keep('light'), dark: keep('dark') };
}

/**
 * Le style d'un logo de marque posé sur un segment du badge : `light-dark()` suit le thème choisi
 * (`color-scheme` de la page). Aucune couleur ne passe ni dans un thème ni dans l'autre : le logo
 * garde la couleur du texte.
 */
export function markStyle(hex: string, segment: 'label' | 'value'): CSSProperties | undefined {
  const { light, dark } = markColors(hex, BADGE_BACKGROUNDS[segment]);
  if (!light && !dark) return undefined;
  if (light === dark) return { color: hex };
  return { color: `light-dark(${light ?? 'currentColor'}, ${dark ?? 'currentColor'})` };
}
