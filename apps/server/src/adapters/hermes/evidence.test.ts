import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDir } from '../../test/hermes-fixtures.ts';
import type { TempDir } from '../../test/hermes-fixtures.ts';
import { GATE_PROOF_BYTES, gateProofs } from './evidence.ts';
import { HermesPaths } from './paths.ts';

let dir: TempDir;
let paths: HermesPaths;
let gate: string;

beforeEach(() => {
  dir = tempDir();
  const board = join(dir.path, 'board');
  const evidence = join(board, 'workspaces', 't_5b556209', 'evidence');
  gate = join(evidence, 'gate', '5ba41e0');
  mkdirSync(gate, { recursive: true });
  mkdirSync(join(dir.path, 'profiles', 'coder'), { recursive: true });
  writeFileSync(join(dir.path, 'profiles', 'coder', '.env'), 'OPENAI_API_KEY=sk-secret\n');
  paths = new HermesPaths({
    profilesDir: join(dir.path, 'profiles'),
    boardDir: board,
    factoryRepo: join(dir.path, 'factory'),
  });
});

afterEach(() => dir.remove());

describe('preuves de la gate', () => {
  it('lit le texte des preuves de la gate par la liste blanche, coupé à 64 Ko', () => {
    writeFileSync(join(gate, '09-fail_first.txt'), '$ npx vitest run\n1 failed\n');
    writeFileSync(join(gate, '10-build.txt'), `jeton ghp_${'x'.repeat(36)} lu\nbuild ok\n`);
    writeFileSync(
      join(gate, '11-couverture.txt'),
      `${'a'.repeat(50_000)}\n${'z'.repeat(50_000)}\n`,
    );
    // Not a proof of a rule: the verdict, a note, and a link to a secret named like a proof.
    writeFileSync(join(gate, 'verdict.json'), '{}');
    writeFileSync(join(gate, 'notes.txt'), 'note');
    symlinkSync(join(dir.path, 'profiles', 'coder', '.env'), join(gate, '12-build.txt'));

    const proofs = gateProofs(paths, 't_5b556209', '5ba41e0');
    expect(proofs.map(({ order, rule }) => ({ order, rule }))).toEqual([
      { order: 9, rule: 'fail_first' },
      { order: 10, rule: 'build' },
      { order: 11, rule: 'couverture' },
    ]);
    expect(proofs[0]!.text).toBe('$ npx vitest run\n1 failed\n');
    // A token a command printed is masked, as in the logs.
    expect(proofs[1]!.text).toBe('jeton [secret masqué] lu\nbuild ok\n');
    // Past 64 KB, its start and its end, where a command says how it ended.
    const cut = proofs[2]!.text;
    expect(Buffer.byteLength(cut)).toBeLessThanOrEqual(GATE_PROOF_BYTES);
    expect(cut.startsWith('aaaa')).toBe(true);
    expect(cut.trimEnd().endsWith('zzzz')).toBe(true);
    expect(proofs.some((proof) => proof.text.includes('sk-secret'))).toBe(false);

    // Never a path out of the list: another card's name, a head that is no sha, a way out.
    expect(gateProofs(paths, '../t_5b556209', '5ba41e0')).toEqual([]);
    expect(gateProofs(paths, 't_5b556209', '../../..')).toEqual([]);
    expect(gateProofs(paths, 't_00000000', '5ba41e0')).toEqual([]);
  });
});
