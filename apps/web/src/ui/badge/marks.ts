import {
  BroadcastIcon,
  ClockIcon,
  CpuIcon,
  DashboardIcon,
  DatabaseIcon,
  GraphIcon,
  PlugIcon,
  PulseIcon,
  ServerIcon,
  StackIcon,
  StopIcon,
  TasklistIcon,
  TerminalIcon,
} from '@primer/octicons-react';
import type { Icon } from '@primer/octicons-react';
import {
  siClaude,
  siDeepseek,
  siGithub,
  siGithubactions,
  siGoogle,
  siGooglegemini,
  siMeta,
  siMistralai,
  siMoonshotai,
  siNvidia,
  siOpencode,
  siQwen,
  siTailscale,
} from 'simple-icons';

/**
 * Un logo de marque de Simple Icons (CC0, le jeu d'icônes de shields.io et de badgen) : son nom, son
 * tracé SVG en 24 × 24 et sa couleur officielle. Embarqué dans le code : rien n'est chargé du réseau.
 * Seules les icônes importées ici entrent dans le bundle.
 */
export interface BrandMark {
  readonly title: string;
  readonly path: string;
  readonly hex: string;
}

/** L'icône d'un badge : une octicon de Primer pour un concept, un logo pour une marque. */
export type BadgeMark = Icon | BrandMark;

export function isBrand(mark: BadgeMark): mark is BrandMark {
  return 'path' in mark && 'hex' in mark;
}

const brand = ({ title, path, hex }: { title: string; path: string; hex: string }): BrandMark => ({
  title,
  path,
  hex: `#${hex.toLowerCase()}`,
});

const CLAUDE = brand(siClaude);
const NVIDIA = brand(siNvidia);
const GOOGLE = brand(siGoogle);
const GEMINI = brand(siGooglegemini);
const QWEN = brand(siQwen);
const MISTRAL = brand(siMistralai);
const META = brand(siMeta);
const DEEPSEEK = brand(siDeepseek);
const MOONSHOT = brand(siMoonshotai);
const OPENCODE = brand(siOpencode);
const GITHUB_ACTIONS = brand(siGithubactions);
const GITHUB = brand(siGithub);
const TAILSCALE = brand(siTailscale);

/** Toutes les marques affichées : le test de contraste les passe en revue. */
export const BRAND_MARKS: readonly BrandMark[] = [
  CLAUDE,
  NVIDIA,
  GOOGLE,
  GEMINI,
  QWEN,
  MISTRAL,
  META,
  DEEPSEEK,
  MOONSHOT,
  OPENCODE,
  GITHUB_ACTIONS,
  GITHUB,
  TAILSCALE,
];

/**
 * L'éditeur d'un modèle, reconnu à son nom (un préfixe d'organisation compris) : le premier motif qui
 * correspond l'emporte (Llama-Nemotron est un modèle NVIDIA). Pas de logo pour OpenAI (gpt-oss) :
 * Simple Icons ne l'a plus ; un modèle inconnu reste sans logo plutôt que d'en recevoir un faux.
 */
const EDITORS: readonly (readonly [RegExp, BrandMark])[] = [
  [/claude/i, CLAUDE],
  [/nemotron|^nvidia\//i, NVIDIA],
  [/gemini/i, GEMINI],
  [/gemma/i, GOOGLE],
  [/qwen|qwq/i, QWEN],
  [/mistral|devstral|codestral|magistral|ministral|pixtral|voxtral/i, MISTRAL],
  [/(^|[^a-z])llama(?!\.cpp)/i, META],
  [/deepseek/i, DEEPSEEK],
  [/kimi|moonshot/i, MOONSHOT],
];

export function modelEditor(model: string): BrandMark | null {
  return EDITORS.find(([pattern]) => pattern.test(model))?.[1] ?? null;
}

/**
 * Le fournisseur (là où le modèle tourne) : son logo s'il est une marque (API NVIDIA, Claude, OpenCode),
 * sinon une octicon : un serveur pour une passerelle (freellmapi), un processeur pour le local
 * (llama.cpp), une pile pour le mélange de modèles (MoA).
 */
const PROVIDERS: Readonly<Record<string, BadgeMark>> = {
  nvidia: NVIDIA,
  anthropic: CLAUDE,
  'claude-code': CLAUDE,
  opencode: OPENCODE,
  freellmapi: ServerIcon,
  llamacpp: CpuIcon,
  moa: StackIcon,
};

export function providerMark(provider: string): BadgeMark {
  return PROVIDERS[provider] ?? ServerIcon;
}

/** La lane CLI se marque de son CLI (Claude Code, OpenCode), sinon d'un terminal. */
export function laneMark(provider: string | null): BadgeMark {
  const mark = provider ? PROVIDERS[provider] : undefined;
  return mark && isBrand(mark) ? mark : TerminalIcon;
}

/** La CI des PR tourne sur GitHub Actions. */
export const CHECKS_MARK: BrandMark = GITHUB_ACTIONS;

/**
 * Un service de la page Santé : son logo s'il est une marque (GitHub et ses webhooks, Tailscale pour le
 * Funnel, NVIDIA et Claude, les mêmes que dans les badges), sinon une octicon qui dit ce qu'il fait.
 * Aucun logo inventé : un service inconnu prend le serveur, comme un fournisseur inconnu.
 */
const SERVICES: Readonly<Record<string, BadgeMark>> = {
  gateway: BroadcastIcon,
  dispatcher: TasklistIcon,
  pause: StopIcon,
  dashboard: DashboardIcon,
  disk: DatabaseIcon,
  claude: CLAUDE,
  graphify: GraphIcon,
  github: GITHUB,
  webhook: GITHUB,
  'github-deliveries': GITHUB,
  funnel: TAILSCALE,
  cron: ClockIcon,
  probe: PulseIcon,
  sources: PlugIcon,
};

export function serviceMark(id: string): BadgeMark {
  const provider = id.startsWith('provider:') ? id.slice('provider:'.length) : id;
  return SERVICES[id] ?? PROVIDERS[provider] ?? ServerIcon;
}
