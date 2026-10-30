/**
 * The badge hues: Primer's « display » palette, 19 hues made for labels
 * (`--display-<hue>-bgColor-muted`, `-borderColor-muted`, `-fgColor`, with the values of each
 * theme). Single source: an agent's badge and its avatar (`ui/agents/avatar.ts`) read it here.
 */
export const HUES = [
  'auburn',
  'blue',
  'brown',
  'coral',
  'cyan',
  'gray',
  'green',
  'indigo',
  'lemon',
  'lime',
  'olive',
  'orange',
  'pine',
  'pink',
  'plum',
  'purple',
  'red',
  'teal',
  'yellow',
] as const;

export type Hue = (typeof HUES)[number];

/** Red means danger: no item takes it. */
const RESERVED: Hue = 'red';

/** The item types that each have their own hues. */
export type HueKind =
  | 'station'
  | 'card'
  | 'repo'
  | 'product'
  | 'board'
  | 'provider'
  | 'model'
  | 'effort'
  | 'skill'
  | 'toolset'
  | 'plugin'
  | 'mcp'
  | 'source'
  | 'agent';

/**
 * The fixed hues of known items, distinct within a type. From one type to another the same
 * hue means the same thing: brief is indigo as a station, as a card type and as a skill;
 * factory-live is blue as a repository, as a product and as a source.
 */
export const FIXED_HUES: Readonly<Record<HueKind, Readonly<Record<string, Hue>>>> = {
  station: {
    intake: 'cyan',
    brief: 'indigo',
    implementation: 'blue',
    gate: 'orange',
    release: 'coral',
    done: 'pine',
    stopped: 'gray',
    side: 'olive',
  },
  card: {
    brief: 'indigo',
    impl: 'blue',
    release: 'coral',
    diagnostic: 'pink',
    watch: 'lemon',
    onboarding: 'teal',
    other: 'gray',
  },
  repo: {
    'claude-cockpit': 'coral',
    'cv-site': 'green',
    'factory-live': 'blue',
    'hermes-software-factory': 'purple',
    'liquid-paper': 'teal',
  },
  product: { Hermès: 'purple', 'factory-live': 'blue' },
  board: { factory: 'brown' },
  provider: {
    'claude-code': 'coral',
    anthropic: 'coral',
    nvidia: 'lime',
    opencode: 'gray',
    freellmapi: 'teal',
    llamacpp: 'brown',
    moa: 'plum',
  },
  // A model without a provider takes its hue from its name: nothing is fixed.
  model: {},
  effort: { low: 'cyan', medium: 'blue', high: 'indigo', xhigh: 'purple', max: 'plum' },
  skill: {
    'factory-brief': 'indigo',
    'factory-author-proof': 'green',
    'factory-cli-lane': 'orange',
    'factory-onboard': 'teal',
  },
  toolset: {
    terminal: 'gray',
    file: 'brown',
    kanban: 'blue',
    memory: 'purple',
    web: 'cyan',
    browser: 'teal',
    clarify: 'yellow',
    session_search: 'olive',
    skills: 'indigo',
    todo: 'lime',
  },
  plugin: {
    'coder-guard': 'orange',
    'coordinator-guard': 'indigo',
    'merge-guard': 'auburn',
    'comment-guard': 'yellow',
    'factory-notify': 'cyan',
  },
  mcp: { graphify: 'pink' },
  source: {
    kanban: 'olive',
    hermes: 'purple',
    github: 'gray',
    comment: 'lemon',
    'factory-live': 'blue',
  },
  agent: {
    coordinator: 'blue',
    'coordinator-claude': 'purple',
    coder: 'green',
    'coder-claude': 'plum',
    'coder-opencode': 'teal',
    gate: 'orange',
    'gate-claude': 'pink',
    scribe: 'yellow',
    release: 'coral',
    'tool-setup': 'gray',
  },
};

/** Deterministic 32-bit fingerprint (FNV-1a), for agent avatars and the hue of an unknown item. */
export function fingerprint(text: string, seed: number): number {
  let hash = 0x811c9dc5 ^ seed;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** The hues a type has not taken yet, never red. */
export function spareHues(kind: HueKind): Hue[] {
  const taken = new Set<Hue>(Object.values(FIXED_HUES[kind]));
  return HUES.filter((hue) => hue !== RESERVED && !taken.has(hue));
}

/**
 * The hue of an item: the one fixed for it, otherwise a hue drawn from its name (FNV-1a
 * fingerprint) among those its type does not use yet. Always the same for a given name.
 */
export function hueOf(kind: HueKind, name: string): Hue {
  const fixed = Object.hasOwn(FIXED_HUES[kind], name) ? FIXED_HUES[kind][name] : undefined;
  if (fixed) return fixed;
  const spare = spareHues(kind);
  return spare[fingerprint(name, 0) % spare.length] as Hue;
}
