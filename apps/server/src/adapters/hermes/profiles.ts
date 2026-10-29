import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { PluginHook, ProfileFacts } from '@factory-live/domain';
import { parse } from 'yaml';
import type {
  FactoryManifest,
  ProfileConfig,
  ProfilesPort,
  RootSettings,
} from '../../application/ports.ts';
import { MAX_CONFIG_BYTES, MAX_PLUGIN_BYTES } from './paths.ts';
import type { HermesPaths } from './paths.ts';

const PROFILE = /^[\w-]+$/;

type Yaml = Record<string, unknown>;

function record(value: unknown): Yaml {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Yaml)
    : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readYaml(path: string): Yaml | null {
  try {
    return record(parse(readFileSync(path, 'utf8')));
  } catch {
    return null;
  }
}

/** Le contenu d'un fichier de la liste blanche, s'il ne dépasse pas son plafond. */
function readCapped(path: string, max: number): string | null {
  try {
    return statSync(path).size <= max ? readFileSync(path, 'utf8') : null;
  } catch {
    return null;
  }
}

/** Un YAML de la liste blanche ; `null` s'il est absent, trop gros ou illisible. */
function parseCapped(path: string, max: number): Yaml | null {
  const content = readCapped(path, max);
  if (content === null) return null;
  try {
    return record(parse(content));
  } catch {
    return null;
  }
}

function mtimeSeconds(path: string): number | null {
  try {
    return statSync(path).mtimeMs / 1000;
  } catch {
    return null;
  }
}

/** Un délai ou un nombre de tours, comme Hermès le lit (`float(...)`) ; autre chose compte pour absent. */
function amount(value: unknown): number | null {
  const number =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  return value !== '' && Number.isFinite(number) ? number : null;
}

function stampOf(path: string | null): string {
  if (!path) return '-';
  try {
    const stat = statSync(path);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return '-';
  }
}

const REGISTER_HOOK = /register_hook\(\s*["'](\w+)["']\s*,\s*(\w+)/g;

/** Les hooks qu'un plugin branche, lus dans son code : `ctx.register_hook("<hook>", <fonction>)`. */
export function pluginHooksOf(plugin: string, source: string): PluginHook[] {
  return [...source.matchAll(REGISTER_HOOK)].map((match) => {
    const start = source.lastIndexOf('\n', match.index) + 1;
    const end = source.indexOf('\n', match.index);
    return {
      plugin,
      hook: match[1] ?? '',
      callback: match[2] ?? '',
      source: source.slice(start, end === -1 ? undefined : end).trim(),
    };
  });
}

/** Un délai écrit en dur dans le code Python d'un plugin : `timeout=120`, `timeout: int = 900`. */
const TIMEOUT_LITERAL = /\btimeout\s*(?::\s*(?:int|float)\s*)?=\s*(\d{1,6}(?:\.\d{1,3})?)\b/g;

/**
 * La plus longue commande que le code d'un plugin peut lancer : le plus grand délai littéral qu'il
 * passe (`subprocess.run(..., timeout=600)`) ou qu'il donne par défaut à une fonction ; `null` sans.
 */
export function longestTimeoutOf(source: string): number | null {
  const values = [...source.matchAll(TIMEOUT_LITERAL)].map((match) => Number(match[1]));
  return values.length > 0 ? Math.max(...values) : null;
}

/** Ce que le diagnostic retient d'une config d'agent : ses délais et ses plugins actifs. */
export function profileFactsOf(
  profile: string,
  yaml: Yaml,
  repo: Yaml | null,
  changedAt: number | null,
  hooks: readonly PluginHook[],
  longestCommands: Readonly<Record<string, number>> = {},
): ProfileFacts {
  const plugins = record(yaml['plugins']);
  const tools = record(record(yaml['timeouts'])['tools']);
  return {
    profile,
    hookTimeout: amount(plugins['hook_callback_timeout']),
    // Hermès retombe sur le délai d'un lot d'outils quand celui d'un appel n'est pas réglé.
    toolDeadline: amount(tools['sequential_call']) ?? amount(tools['concurrent_batch']),
    terminalTimeout: amount(record(yaml['terminal'])['timeout']),
    maxTurns: amount(record(yaml['agent'])['max_turns']),
    changedAt,
    ...(repo ? { repoHookTimeout: amount(record(repo['plugins'])['hook_callback_timeout']) } : {}),
    plugins: strings(plugins['enabled']),
    hooks,
    longestCommands,
  };
}

export function profileConfigOf(yaml: Yaml): ProfileConfig {
  const model = record(yaml['model']);
  const agent = record(yaml['agent']);
  const toolsets = record(yaml['platform_toolsets']);
  const hooks = record(yaml['hooks']);
  const name = str(model['default']);
  return {
    model: name ? { model: name, provider: str(model['provider']) ?? '?' } : null,
    baseUrl: str(model['base_url']),
    fallbacks: (Array.isArray(yaml['fallback_providers'])
      ? yaml['fallback_providers']
      : []
    ).flatMap((entry: unknown) => {
      const fallback = record(entry);
      const fallbackModel = str(fallback['model']);
      return fallbackModel
        ? [{ model: fallbackModel, provider: str(fallback['provider']) ?? '?' }]
        : [];
    }),
    effort: str(agent['reasoning_effort']),
    toolsets: strings(toolsets['cli']),
    plugins: strings(record(yaml['plugins'])['enabled']),
    mcp: Object.keys(record(yaml['mcp_servers'])),
    outboundHooks: (Array.isArray(hooks['outbound']) ? hooks['outbound'] : []).flatMap(
      (entry: unknown) => {
        const hook = str(record(entry)['name']);
        return hook ? [hook] : [];
      },
    ),
  };
}

/**
 * Configuration des profils : celle en service (`~/.hermes/profiles/<p>/config.yaml`) et celle du dépôt
 * de la factory, pour signaler la dérive. Chemins construits ici, jamais reçus d'un client.
 */
export class ProfileConfigReader implements ProfilesPort {
  private readonly hermesHome: string;
  private readonly factoryRepo: string;
  private readonly paths: HermesPaths;
  /** Les fichiers lus par le dernier `facts` de chaque agent : leur empreinte dit quand relire. */
  private readonly factsFiles = new Map<string, string[]>();

  constructor(hermesHome: string, factoryRepo: string, paths: HermesPaths) {
    this.hermesHome = hermesHome;
    this.factoryRepo = factoryRepo;
    this.paths = paths;
  }

  profiles(): string[] {
    try {
      return readdirSync(join(this.hermesHome, 'profiles'))
        .filter(
          (name) =>
            PROFILE.test(name) && statSync(join(this.hermesHome, 'profiles', name)).isDirectory(),
        )
        .sort();
    } catch {
      return [];
    }
  }

  live(profile: string): ProfileConfig | null {
    if (!PROFILE.test(profile)) return null;
    const yaml = readYaml(join(this.hermesHome, 'profiles', profile, 'config.yaml'));
    return yaml ? profileConfigOf(yaml) : null;
  }

  repo(profile: string): ProfileConfig | null {
    if (!PROFILE.test(profile)) return null;
    const yaml = readYaml(join(this.factoryRepo, 'profiles', profile, 'config.yaml'));
    return yaml ? profileConfigOf(yaml) : null;
  }

  manifest(): FactoryManifest {
    const yaml = readYaml(join(this.factoryRepo, 'factory.yaml')) ?? {};
    const projects = Object.fromEntries(
      Object.entries(record(yaml['projects'])).flatMap(([name, value]) => {
        const repo = str(record(value)['repo']);
        return repo ? [[name, { repo }]] : [];
      }),
    );
    const profiles = Object.fromEntries(
      Object.entries(record(yaml['profiles'])).map(([name, value]) => [
        name,
        { skills: strings(record(value)['skills']), plugins: strings(record(value)['plugins']) },
      ]),
    );
    return { owner: str(yaml['github_user']), projects, profiles };
  }

  facts(profile: string): ProfileFacts | null {
    const path = this.paths.config(profile);
    const yaml = path ? parseCapped(path, MAX_CONFIG_BYTES) : null;
    if (!path || !yaml) return null;
    const repoPath = this.paths.repoConfig(profile);
    const read = [path, ...(repoPath ? [repoPath] : [])];
    const longest: Record<string, number> = {};
    const hooks = strings(record(yaml['plugins'])['enabled']).flatMap((plugin) => {
      const source = this.paths.pluginSource(profile, plugin);
      const code = source ? readCapped(source, MAX_PLUGIN_BYTES) : null;
      if (!source || code === null) return [];
      read.push(source);
      const seconds = longestTimeoutOf(code);
      if (seconds !== null) longest[plugin] = seconds;
      return pluginHooksOf(plugin, code);
    });
    this.factsFiles.set(profile, read);
    return profileFactsOf(
      profile,
      yaml,
      repoPath ? parseCapped(repoPath, MAX_CONFIG_BYTES) : null,
      mtimeSeconds(path),
      hooks,
      longest,
    );
  }

  factsStamp(profile: string): string {
    const files = this.factsFiles.get(profile) ?? [this.paths.config(profile)];
    return files.map(stampOf).join('|');
  }

  root(): RootSettings {
    const kanban = record((readYaml(join(this.hermesHome, 'config.yaml')) ?? {})['kanban']);
    const positive = (value: unknown, fallback: number) =>
      typeof value === 'number' && value > 0 ? value : fallback;
    return {
      maxInProgress: positive(kanban['max_in_progress'], 2),
      maxInProgressPerProfile: positive(kanban['max_in_progress_per_profile'], 1),
    };
  }
}
