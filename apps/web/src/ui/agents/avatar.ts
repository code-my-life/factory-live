import { fingerprint, hueOf } from '../badge/hues.ts';
import type { Hue } from '../badge/hues.ts';

/**
 * Avatars des agents : un identicon par agent, à la manière des avatars par défaut de GitHub
 * (grille 5 × 5 symétrique sur fond clair), affiché par le composant `Avatar` de Primer en carré,
 * the shape Primer reserves for bots and apps. An agent's hue comes from the single table of hues
 * (`ui/badge/hues.ts`), the same as its badge's; here, the solid color of that hue, readable on the
 * light background of the image (light theme values).
 */
const HUE_COLOR: Readonly<Record<Hue, string>> = {
  auburn: '#9d615c',
  blue: '#006edb', // data-blue
  brown: '#856d4c',
  coral: '#d43511', // data-coral
  cyan: '#007b94',
  gray: '#808fa3', // data-gray
  green: '#30a147', // data-green
  indigo: '#5a61e7',
  lemon: '#866e04',
  lime: '#527a29',
  olive: '#64762d',
  orange: '#eb670f', // data-orange
  pine: '#167e53',
  pink: '#ce2c85', // data-pink
  plum: '#a830e8', // data-plum
  purple: '#894ceb', // data-purple
  red: '#df0c24',
  teal: '#179b9b', // data-teal
  yellow: '#b88700', // data-yellow
};

const BACKGROUND = '#f6f8fa'; // bgColor-muted du thème clair, comme les avatars par défaut de GitHub
const GRID = 5;

/** The identicon color of an agent: that of its hue (an unknown agent gets one by fingerprint). */
export function agentColor(profile: string): string {
  return HUE_COLOR[hueOf('agent', profile)];
}

/**
 * Cases pleines de la grille : trois colonnes tirées de l'empreinte, recopiées en miroir.
 * Le motif est rejeté et retiré s'il est presque vide ou presque plein (illisible en petit).
 */
export function agentPattern(profile: string): boolean[][] {
  for (let seed = 0; ; seed += 1) {
    const bits = fingerprint(profile, seed);
    const rows: boolean[][] = [];
    for (let row = 0; row < GRID; row += 1) {
      const half = [0, 1, 2].map((column) => ((bits >>> (row * 3 + column)) & 1) === 1);
      rows.push([half[0], half[1], half[2], half[1], half[0]] as boolean[]);
    }
    const filled = rows.flat().filter(Boolean).length;
    if (filled >= 8 && filled <= 17) return rows;
  }
}

const cache = new Map<string, string>();

/** Image de l'avatar en data URI SVG (autorisée par la CSP de factory-live : `img-src 'self' data:`). */
export function agentAvatarUri(profile: string): string {
  const known = cache.get(profile);
  if (known) return known;
  const color = agentColor(profile);
  const cells = agentPattern(profile)
    .flatMap((row, y) =>
      row.map((filled, x) =>
        filled ? `<rect x="${x + 0.5}" y="${y + 0.5}" width="1" height="1"/>` : '',
      ),
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6 6" shape-rendering="crispEdges"><rect width="6" height="6" fill="${BACKGROUND}"/><g fill="${color}">${cells}</g></svg>`;
  const uri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  cache.set(profile, uri);
  return uri;
}
