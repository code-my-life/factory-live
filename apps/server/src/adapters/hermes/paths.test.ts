import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDir } from '../../test/hermes-fixtures.ts';
import type { TempDir } from '../../test/hermes-fixtures.ts';
import { HermesPaths } from './paths.ts';

let dir: TempDir;
let paths: HermesPaths;
let profiles: string;
let board: string;
let repo: string;

beforeEach(() => {
  dir = tempDir();
  profiles = join(dir.path, 'profiles');
  board = join(dir.path, 'board');
  repo = join(dir.path, 'factory');
  mkdirSync(join(profiles, 'coder', 'logs'), { recursive: true });
  mkdirSync(join(profiles, 'coder', 'plugins', 'coder-guard'), { recursive: true });
  mkdirSync(join(repo, 'plugins', 'merge-guard'), { recursive: true });
  mkdirSync(join(repo, 'profiles', 'coder'), { recursive: true });
  mkdirSync(join(board, 'workspaces', 't_665ba7d7', 'evidence'), { recursive: true });
  mkdirSync(join(board, 'evidence', 't_03d9d40d'), { recursive: true });
  writeFileSync(join(profiles, 'coder', 'config.yaml'), 'plugins: {}\n');
  writeFileSync(join(profiles, 'coder', '.env'), 'OPENAI_API_KEY=sk-secret\n');
  writeFileSync(join(profiles, 'coder', 'auth.json'), '{}');
  writeFileSync(join(profiles, 'coder', 'logs', 'agent.log'), '');
  writeFileSync(join(profiles, 'coder', 'plugins', 'coder-guard', '__init__.py'), '');
  writeFileSync(join(repo, 'plugins', 'merge-guard', '__init__.py'), '');
  writeFileSync(join(repo, 'profiles', 'coder', 'config.yaml'), '');
  paths = new HermesPaths({ profilesDir: profiles, boardDir: board, factoryRepo: repo });
});

afterEach(() => dir.remove());

describe('HermesPaths', () => {
  it('rend la config, le journal et le code des plugins d’un agent connu', () => {
    expect(paths.config('coder')).toBe(join(profiles, 'coder', 'config.yaml'));
    expect(paths.repoConfig('coder')).toBe(join(repo, 'profiles', 'coder', 'config.yaml'));
    expect(paths.agentLogs('coder')).toEqual([join(profiles, 'coder', 'logs', 'agent.log')]);
    expect(paths.pluginSource('coder', 'coder-guard')).toBe(
      join(profiles, 'coder', 'plugins', 'coder-guard', '__init__.py'),
    );
    // Plugin absent du profil : celui du dépôt de la factory.
    expect(paths.pluginSource('coder', 'merge-guard')).toBe(
      join(repo, 'plugins', 'merge-guard', '__init__.py'),
    );
  });

  it('refuse tout nom qui sortirait de sa racine, et tout autre fichier du profil', () => {
    for (const name of ['..', '../coder', 'coder/..', '.env', 'auth.json', 'coder/.env', '']) {
      expect(paths.config(name)).toBeNull();
      expect(paths.agentLogs(name)).toEqual([]);
      expect(paths.pluginSource('coder', name)).toBeNull();
      expect(paths.pluginSource(name, 'coder-guard')).toBeNull();
    }
    expect(paths.evidenceDir('../t_665ba7d7')).toBeNull();
    expect(paths.evidenceDir('t_665BA7D7')).toBeNull();
  });

  it('ne suit aucun lien symbolique, même posé dans un profil', () => {
    mkdirSync(join(profiles, 'scribe', 'logs'), { recursive: true });
    symlinkSync(join(profiles, 'coder', '.env'), join(profiles, 'scribe', 'config.yaml'));
    symlinkSync(join(profiles, 'coder', 'logs'), join(profiles, 'linked'));
    symlinkSync(
      join(profiles, 'coder', 'auth.json'),
      join(profiles, 'scribe', 'logs', 'agent.log'),
    );
    expect(paths.config('scribe')).toBeNull();
    expect(paths.agentLogs('scribe')).toEqual([]);
    expect(paths.agentLogs('linked')).toEqual([]);
  });

  it('trouve les preuves dans le worktree, sinon dans la copie du tableau', () => {
    expect(paths.evidenceDir('t_665ba7d7')).toBe(
      join(board, 'workspaces', 't_665ba7d7', 'evidence'),
    );
    expect(paths.evidenceDir('t_03d9d40d')).toBe(join(board, 'evidence', 't_03d9d40d'));
    expect(paths.evidenceDir('t_00000000')).toBeNull();
    const evidence = join(board, 'workspaces', 't_665ba7d7', 'evidence');
    writeFileSync(join(evidence, '01-test.txt'), 'ok');
    symlinkSync(join(profiles, 'coder', '.env'), join(evidence, '02-env.txt'));
    expect(paths.evidenceEntry(evidence, ['01-test.txt'], 'file')).toBe(
      join(evidence, '01-test.txt'),
    );
    expect(paths.evidenceEntry(evidence, ['02-env.txt'], 'file')).toBeNull();
    expect(paths.evidenceEntry(evidence, ['..', '..', 'evidence'], 'dir')).toBeNull();
  });
});
