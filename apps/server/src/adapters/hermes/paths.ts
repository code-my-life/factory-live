import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';

const NAME = /^[\w-]+$/;
const CARD = /^t_[0-9a-f]{8}$/;

/** Plafonds de lecture : un fichier plus gros n'est pas un fichier que le diagnostic attend. */
export const MAX_CONFIG_BYTES = 256 * 1024;
export const MAX_PLUGIN_BYTES = 512 * 1024;

function inside(root: string, path: string): boolean {
  const rest = relative(root, path);
  return rest !== '' && !rest.startsWith('..') && !isAbsolute(rest);
}

/**
 * Un fichier (ou dossier) sous sa racine, sans lien symbolique sur le chemin : le chemin réel doit être
 * le chemin construit. Un lien posé dans un profil ne fait donc rien lire d'autre que ce qu'il nomme.
 */
function real(root: string, parts: readonly string[], kind: 'file' | 'dir'): string | null {
  const path = join(root, ...parts);
  if (!inside(root, path)) return null;
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || (kind === 'file' ? !stat.isFile() : !stat.isDirectory()))
      return null;
    return realpathSync(path) === join(realpathSync(root), ...parts) ? path : null;
  } catch {
    return null;
  }
}

/**
 * Les seuls fichiers d'Hermès et de la factory que le diagnostic lit, construits ici à partir de noms
 * vérifiés, jamais reçus d'un client : la config d'un agent, son journal, le code de ses plugins actifs,
 * les preuves d'une carte. Rien d'autre d'un profil (`.env`, `auth.json`, sessions) ne passe par ici.
 */
export class HermesPaths {
  private readonly profilesDir: string;
  private readonly boardDir: string;
  private readonly factoryRepo: string;

  constructor(options: { profilesDir: string; boardDir: string; factoryRepo: string }) {
    this.profilesDir = options.profilesDir;
    this.boardDir = options.boardDir;
    this.factoryRepo = options.factoryRepo;
  }

  /** `profiles/<agent>/config.yaml`, la config en service. */
  config(profile: string): string | null {
    return NAME.test(profile) ? real(this.profilesDir, [profile, 'config.yaml'], 'file') : null;
  }

  /** `profiles/<agent>/config.yaml` du dépôt de la factory. */
  repoConfig(profile: string): string | null {
    return NAME.test(profile)
      ? real(this.factoryRepo, ['profiles', profile, 'config.yaml'], 'file')
      : null;
  }

  /** Le code d'un plugin installé pour l'agent, sinon celui du dépôt de la factory. */
  pluginSource(profile: string, plugin: string): string | null {
    if (!NAME.test(profile) || !NAME.test(plugin)) return null;
    return (
      real(this.profilesDir, [profile, 'plugins', plugin, '__init__.py'], 'file') ??
      real(this.factoryRepo, ['plugins', plugin, '__init__.py'], 'file')
    );
  }

  /** Le journal d'Hermès de l'agent : le fichier précédent (rotation) d'abord, puis le courant. */
  agentLogs(profile: string): string[] {
    if (!NAME.test(profile)) return [];
    return ['agent.log.1', 'agent.log'].flatMap((name) => {
      const path = real(this.profilesDir, [profile, 'logs', name], 'file');
      return path ? [path] : [];
    });
  }

  /**
   * Le dossier de preuves d'une carte : `evidence/` de son worktree, sinon la copie que la factory en
   * garde sur le tableau (`evidence/<carte>`), qui survit au nettoyage du worktree.
   */
  evidenceDir(cardId: string): string | null {
    if (!CARD.test(cardId)) return null;
    return (
      real(this.boardDir, ['workspaces', cardId, 'evidence'], 'dir') ??
      real(this.boardDir, ['evidence', cardId], 'dir')
    );
  }

  /** Un fichier sous un dossier rendu par `evidenceDir`, sans lien ni sortie du dossier. */
  evidenceEntry(dir: string, parts: readonly string[], kind: 'file' | 'dir'): string | null {
    return parts.every((part) => part !== '' && part !== '.' && part !== '..')
      ? real(dir, parts, kind)
      : null;
  }
}
