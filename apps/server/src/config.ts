import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AppAddresses } from '@factory-live/contracts';
import { z } from 'zod';

const list = (fallback = '') =>
  z
    .string()
    .default(fallback)
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    );

/** Liste d'URL séparées par des virgules (origines publiques de la PWA). */
const urls = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.url()));

const flag = z
  .enum(['0', '1', 'true', 'false', ''])
  .default('')
  .transform((value) => value === '1' || value === 'true');

/**
 * Variables d'environnement. Les chemins par défaut sont ceux de WSL, pour lancer le serveur hors
 * Docker ; le conteneur les remplace par ses points de montage (docker/compose.yaml).
 */
const Env = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(8446),
  HOST: z.string().default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  HERMES_HOME: z.string().default(join(homedir(), '.hermes')),
  HERMES_BOARD: z
    .string()
    .regex(/^[\w-]+$/)
    .default('factory'),
  FACTORY_REPO: z.string().default(join(homedir(), 'perso', 'hermes-software-factory')),
  CLAUDE_PROJECTS: z.string().default(join(homedir(), '.claude', 'projects')),
  OPENCODE_DB: z.string().default(join(homedir(), '.local', 'share', 'opencode', 'opencode.db')),
  DATA_DIR: z.string().default(join(homedir(), '.local', 'share', 'factory-live')),
  SECRETS_DIR: z.string().default(join(homedir(), '.config', 'factory-live')),
  WEB_DIST: z.string().default(resolve(import.meta.dirname, '../../web/dist')),
  GITHUB_OWNER: z.string().default('code-my-life'),
  GITHUB_LOGIN: z.string().default('cddev'),
  GITHUB_API: z.url().default('https://api.github.com'),
  /** Bot de la factory (GitHub App) : seule sa réaction au commentaire de déblocage compte. */
  FACTORY_BOT_LOGIN: z.string().min(1).default('code-my-life-factory[bot]'),
  /** Logins Tailscale autorisés à écrire (en-tête `Tailscale-User-Login` posé par `tailscale serve`). */
  TAILSCALE_LOGINS: list(),
  /**
   * Origines de la PWA : localhost au port du service si rien n'est dit, plus le nom tailnet pour les
   * autres appareils (docker/.env). Leurs hôtes sont autorisés dans l'en-tête `Host`.
   */
  PUBLIC_ORIGINS: urls,
  /** Hôtes autorisés en plus de ce PC et des origines publiques (port publié différent, autre nom). */
  ALLOWED_HOSTS: list(),
  /** Adresse tailnet du dashboard d'Hermès, pour le lien des interventions (docker/.env) ; vide : pas de lien. */
  DASHBOARD_URL: z
    .union([z.literal(''), z.url()])
    .default('')
    .transform((value) => value || null),
  FREELLMAPI_URL: z.string().default(''),
  HELD_AFTER_MINUTES: z.coerce.number().int().positive().default(30),
  /** Contact exigé par Web Push (claim `sub`) : l'URL du dépôt plutôt qu'une adresse e-mail. */
  VAPID_SUBJECT: z.string().default('https://github.com/code-my-life/factory-live'),
  DEMO: flag,
});

export interface Secrets {
  hookSecret: string | null;
  githubToken: string | null;
}

export type Config = z.infer<typeof Env> & {
  /** Valeurs de l'en-tête `Host` acceptées (`allowedHosts`). */
  allowedHosts: string[];
  /** Où ouvrir l'app, d'après les origines publiques (`appAddresses`). */
  addresses: AppAddresses;
  boardDir: string;
  kanbanDb: string;
  profilesDir: string;
  secrets: Secrets;
};

function readSecret(dir: string, name: string): string | null {
  try {
    const value = readFileSync(join(dir, name), 'utf8').trim();
    return value || null;
  } catch {
    return null;
  }
}

/** Ce PC, quel que soit le nom qu'on lui donne dans l'adresse. */
const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'] as const;

/**
 * Hôtes acceptés dans l'en-tête `Host`, contre le DNS rebinding : ce PC au port du service, l'hôte de
 * chaque origine publique (le nom tailnet), puis ceux d'`ALLOWED_HOSTS`. Une page piégée qui fait
 * pointer son propre domaine sur 127.0.0.1 envoie son nom à elle : il n'est pas dans la liste.
 */
export function allowedHosts(
  port: number,
  origins: readonly string[],
  extra: readonly string[] = [],
): string[] {
  const hosts = [
    ...LOOPBACK.map((name) => `${name}:${port}`),
    ...origins.map((origin) => new URL(origin).host),
    ...extra,
  ].map((host) => host.toLowerCase());
  return [...new Set(hosts)];
}

/**
 * Où ouvrir l'app : sur ce PC, la première origine publique locale ; depuis les autres appareils, la
 * première qui ne l'est pas (le nom tailnet de docker/.env), ou rien.
 */
export function appAddresses(origins: readonly string[], port: number): AppAddresses {
  const onThisPc = (origin: string) =>
    (LOOPBACK as readonly string[]).includes(new URL(origin).hostname);
  return {
    local: origins.find(onThisPc) ?? `http://localhost:${port}`,
    tailnet: origins.find((origin) => !onThisPc(origin)) ?? null,
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.parse(env);
  const boardDir = join(parsed.HERMES_HOME, 'kanban', 'boards', parsed.HERMES_BOARD);
  const origins =
    parsed.PUBLIC_ORIGINS.length > 0 ? parsed.PUBLIC_ORIGINS : [`http://localhost:${parsed.PORT}`];
  return {
    ...parsed,
    PUBLIC_ORIGINS: origins,
    allowedHosts: allowedHosts(parsed.PORT, origins, parsed.ALLOWED_HOSTS),
    addresses: appAddresses(origins, parsed.PORT),
    boardDir,
    kanbanDb: join(boardDir, 'kanban.db'),
    profilesDir: join(parsed.HERMES_HOME, 'profiles'),
    secrets: {
      hookSecret: readSecret(parsed.SECRETS_DIR, 'hook-secret'),
      githubToken: readSecret(parsed.SECRETS_DIR, 'github-token'),
    },
  };
}
