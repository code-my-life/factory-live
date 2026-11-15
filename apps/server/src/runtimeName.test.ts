// CI rule (code-my-life/factory-live#72, AD-1): factory-live reads the core, and only the core's adapter knows
// the agent runtime that runs the factory. No tracked file of `apps/`, `packages/`, `docker/`, `e2e/` and
// `scripts/` names it, but the exempt folders below and the factory's repository name: no declared file, no
// allowed value (code-my-life/factory-live#109). Model: `scripts/check-text.mjs`.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');
const SCANNED = ['apps/', 'packages/', 'docker/', 'e2e/', 'scripts/'];
const THIS_TEST = 'apps/server/src/runtimeName.test.ts';

/** The name, whatever its case or accent. */
const NAME = /herm[eè]s/iu;
/** The name of the factory's repository is allowed everywhere. */
const REPOSITORY = /hermes-software-factory/giu;

/**
 * Exempt folders: the studio's view and its server adapter, with their tests, until the studio's epic on the
 * core; the dictionaries (the sentences shown to the owner); the demo; this test.
 */
const EXEMPT_DIRECTORIES = [
  'apps/web/src/features/studio/',
  'apps/server/src/adapters/workflows/',
  'apps/web/src/i18n/',
  'apps/web/src/demo/',
];

/**
 * The value the files of the old declared list wrote, between quotes (code-my-life/factory-live#109); built here
 * so that no line of the repository writes it, not even this test.
 */
const QUOTED = `'${['her', 'mes'].join('')}'`;

interface Mention {
  file: string;
  line: number;
}

/** The mentions of a file, `line` 0 for its path. */
function mentionsIn(file: string, content: string): Mention[] {
  if (EXEMPT_DIRECTORIES.some((directory) => file.startsWith(directory)) || file === THIS_TEST)
    return [];
  const found: Mention[] = [];
  if (NAME.test(file.replace(REPOSITORY, ''))) found.push({ file, line: 0 });
  content.split('\n').forEach((text, index) => {
    if (NAME.test(text.replace(REPOSITORY, ''))) found.push({ file, line: index + 1 });
  });
  return found;
}

/** The mentions of a tree, file by file; binary files are skipped. */
function mentionsOf(root: string, files: readonly string[]): Mention[] {
  return files
    .filter((file) => SCANNED.some((directory) => file.startsWith(directory)))
    .flatMap((file) => {
      let content: string;
      try {
        content = readFileSync(join(root, file), 'utf8');
      } catch {
        return [];
      }
      if (content.includes('\0')) return [];
      return mentionsIn(file, content);
    });
}

/** The repository's tracked files, as `scripts/check-text.mjs` lists them. */
function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
}

function filesUnder(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'));
}

const report = (mentions: readonly Mention[]) =>
  mentions.map(({ file, line }) => (line === 0 ? `${file} (nom du fichier)` : `${file}:${line}`));

describe('la règle du nom de la factory', () => {
  let tree: string | null = null;
  afterEach(() => {
    if (tree) rmSync(tree, { recursive: true, force: true });
    tree = null;
  });

  const write = (root: string, file: string, content: string) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  };

  it('aucun fichier ne nomme Hermès hors de la vue du studio', () => {
    expect(report(mentionsOf(ROOT, trackedFiles()))).toEqual([]);
  });

  it('une mention ajoutée hors de la vue du studio est trouvée et nommée', () => {
    tree = mkdtempSync(join(tmpdir(), 'factory-live-name-'));
    write(tree, 'apps/server/src/application/added.ts', "// lu\nexport const source = 'Hermès';\n");
    write(tree, 'apps/web/src/features/studio/added.ts', "export const source = 'Hermès';\n");
    write(tree, 'apps/server/src/adapters/workflows/added.ts', '// Hermes\n');
    write(tree, 'apps/web/src/i18n/added.ts', "export const fr = 'Hermès';\n");
    write(tree, 'docker/compose.yaml', '# code-my-life/hermes-software-factory\n');
    write(tree, 'site/page.mjs', "export const page = 'Hermès';\n");

    expect(report(mentionsOf(tree, filesUnder(tree)))).toEqual([
      'apps/server/src/application/added.ts:2',
    ]);
  });

  it(`la chaîne ${QUOTED} est refusée dans un fichier de l'ancienne liste`, () => {
    tree = mkdtempSync(join(tmpdir(), 'factory-live-name-'));
    write(tree, 'apps/server/src/application/health.ts', `// lu\nconst group = ${QUOTED};\n`);
    write(tree, 'packages/contracts/src/runtime.ts', `export const FACTORY_RUNTIME = ${QUOTED};\n`);

    expect(report(mentionsOf(tree, filesUnder(tree))).sort()).toEqual([
      'apps/server/src/application/health.ts:2',
      'packages/contracts/src/runtime.ts:1',
    ]);
    // Only the repository's name stays allowed there, as everywhere.
    expect(
      report(mentionsIn('apps/server/src/application/health.ts', "'hermes-software-factory'")),
    ).toEqual([]);
    expect(report(mentionsIn('packages/contracts/src/runtime.ts', '// Hermes'))).toEqual([
      'packages/contracts/src/runtime.ts:1',
    ]);
  });

  it('un fichier dont le chemin nomme la factory est nommé', () => {
    expect(report(mentionsIn('packages/domain/src/hermes.ts', ''))).toEqual([
      'packages/domain/src/hermes.ts (nom du fichier)',
    ]);
  });
});
