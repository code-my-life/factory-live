import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type {
  FactoryManifest,
  ProfileConfig,
  ProfilesPort,
  RootSettings,
} from '../../application/ports.ts';

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

  constructor(hermesHome: string, factoryRepo: string) {
    this.hermesHome = hermesHome;
    this.factoryRepo = factoryRepo;
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
