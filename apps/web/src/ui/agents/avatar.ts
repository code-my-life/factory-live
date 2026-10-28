/**
 * Avatars des agents : un identicon par agent, à la manière des avatars par défaut de GitHub
 * (grille 5 × 5 symétrique sur fond clair), affiché par le composant `Avatar` de Primer en carré,
 * la forme que Primer réserve aux bots et aux apps. Couleurs : palette de visualisation de Primer
 * (`--data-*-color-emphasis`, valeurs du thème clair, lisibles sur le fond clair de l'image).
 */

/** Une couleur par agent de la factory, toutes différentes (rôle voisin, teinte voisine mais distincte). */
const AGENT_COLOR: Readonly<Record<string, string>> = {
  coordinator: '#006edb', // data-blue
  'coordinator-claude': '#894ceb', // data-purple
  coder: '#30a147', // data-green
  'coder-claude': '#a830e8', // data-plum
  'coder-opencode': '#179b9b', // data-teal
  gate: '#eb670f', // data-orange
  'gate-claude': '#ce2c85', // data-pink
  scribe: '#b88700', // data-yellow
  release: '#d43511', // data-coral
  'tool-setup': '#808fa3', // data-gray
};

/** Pour un agent inconnu de la liste : une teinte de la même palette, choisie par empreinte du nom. */
const SPARE_COLORS = ['#527a29', '#64762d', '#167e53', '#9d615c', '#856d4c', '#866e04', '#df0c24'];

const BACKGROUND = '#f6f8fa'; // bgColor-muted du thème clair, comme les avatars par défaut de GitHub
const GRID = 5;

/** Empreinte 32 bits déterministe (FNV-1a), suffisante pour dessiner un motif. */
function fingerprint(text: string, seed: number): number {
  let hash = 0x811c9dc5 ^ seed;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function agentColor(profile: string): string {
  return (
    AGENT_COLOR[profile] ?? (SPARE_COLORS[fingerprint(profile, 7) % SPARE_COLORS.length] as string)
  );
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
