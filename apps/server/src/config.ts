import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
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
  /** Logins Tailscale autorisés à écrire (en-tête `Tailscale-User-Login` posé par `tailscale serve`). */
  TAILSCALE_LOGINS: list(),
  /** Origines de la PWA : localhost sur ce PC, nom tailnet pour les autres appareils. */
  PUBLIC_ORIGINS: list('http://localhost:8446,https://desktop-gja56n4.tail40220c.ts.net:8446'),
  DASHBOARD_URL: z.url().default('https://desktop-gja56n4.tail40220c.ts.net:8443'),
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.parse(env);
  const boardDir = join(parsed.HERMES_HOME, 'kanban', 'boards', parsed.HERMES_BOARD);
  return {
    ...parsed,
    boardDir,
    kanbanDb: join(boardDir, 'kanban.db'),
    profilesDir: join(parsed.HERMES_HOME, 'profiles'),
    secrets: {
      hookSecret: readSecret(parsed.SECRETS_DIR, 'hook-secret'),
      githubToken: readSecret(parsed.SECRETS_DIR, 'github-token'),
    },
  };
}
