import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDir } from '../../test/hermes-fixtures.ts';
import type { TempDir } from '../../test/hermes-fixtures.ts';
import { CardFiles } from './files.ts';
import { HermesPaths } from './paths.ts';

let dir: TempDir;
let board: string;
let files: CardFiles;

beforeEach(() => {
  dir = tempDir();
  board = join(dir.path, 'board');
  mkdirSync(board, { recursive: true });
  files = new CardFiles(
    board,
    join(dir.path, 'claude-projects'),
    new HermesPaths({
      profilesDir: join(dir.path, 'profiles'),
      boardDir: board,
      factoryRepo: join(dir.path, 'factory'),
    }),
  );
});

afterEach(() => dir.remove());

describe('CardFiles.evidence', () => {
  it('liste les preuves du worktree, sous-dossiers de la gate compris, sans marqueur ni lien', () => {
    const evidence = join(board, 'workspaces', 't_665ba7d7', 'evidence');
    mkdirSync(join(evidence, 'gate', '1'), { recursive: true });
    writeFileSync(join(evidence, '02-test-passes-on-tip.txt'), 'ok');
    writeFileSync(join(evidence, '01-test-fails-on-base.txt'), 'FAIL');
    writeFileSync(join(evidence, '.reviewer'), 'claude');
    writeFileSync(join(evidence, 'gate', '1', '01-fail-first-on-base.txt'), 'x'.repeat(42));
    writeFileSync(join(dir.path, 'secret.env'), 'TOKEN=x');
    symlinkSync(join(dir.path, 'secret.env'), join(evidence, '03-lien.txt'));
    const listed = files.evidence('t_665ba7d7');
    expect(listed?.map((file) => [file.name, file.bytes])).toEqual([
      ['01-test-fails-on-base.txt', 4],
      ['02-test-passes-on-tip.txt', 2],
      ['gate/1/01-fail-first-on-base.txt', 42],
    ]);
    expect(listed?.[0]?.at).toBeGreaterThan(0);
  });

  it('se rabat sur la copie du tableau, puis sur rien', () => {
    mkdirSync(join(board, 'evidence', 't_03d9d40d'), { recursive: true });
    writeFileSync(join(board, 'evidence', 't_03d9d40d', '01.txt'), '');
    expect(files.evidence('t_03d9d40d')?.map((file) => file.name)).toEqual(['01.txt']);
    expect(files.evidence('t_00000000')).toBeNull();
    expect(files.evidence('../t_03d9d40d')).toBeNull();
    expect(files.evidenceStamp('t_00000000')).toBe('-');
  });

  it('s’arrête à 50 fichiers', () => {
    const evidence = join(board, 'evidence', 't_03d9d40d');
    mkdirSync(evidence, { recursive: true });
    for (let index = 0; index < 60; index += 1)
      writeFileSync(join(evidence, `${String(index).padStart(2, '0')}.txt`), '');
    expect(files.evidence('t_03d9d40d')).toHaveLength(50);
  });
});
