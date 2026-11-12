import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diagnose } from '@factory-live/domain';
import type { LogFact } from '@factory-live/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { INCIDENTS, REFERENCE_CASES } from '@factory-live/domain/diagnosis-references';
import { diagnosisView } from '../application/diagnosis.ts';
import {
  REFERENCES_DIR,
  anonymityProblems,
  exportReferences,
  journalFacts,
} from './diagnosisReferences.ts';
import type { ReferenceFile } from './diagnosisReferences.ts';

/*
 * The reference outputs of the 13 incidents (fixtures/diagnosis-references/), the proof that the
 * core's port of the diagnosis is faithful (code-my-life/workflow-core#17): each file keeps the input of
 * a test of `diagnose.test.ts`, the log read again by `AgentLogReader` and the output in the contract's
 * form. `npm run export:diagnosis-references` rewrites them.
 */

function published(): Map<string, { text: string; file: ReferenceFile }> {
  const files = new Map<string, { text: string; file: ReferenceFile }>();
  for (const name of readdirSync(REFERENCES_DIR).sort()) {
    const text = readFileSync(join(REFERENCES_DIR, name), 'utf8');
    files.set(name, { text, file: JSON.parse(text) as ReferenceFile });
  }
  return files;
}

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'diagnosis-references-test-'));
  temporary.push(dir);
  return dir;
}

describe('les sorties de référence du diagnostic', () => {
  it('chaque sortie de référence est le diagnostic calculé sur son entrée', () => {
    const files = published();
    expect(files.size).toBe(13);
    for (const [name, { file }] of files)
      expect(diagnosisView(diagnose(file.input)), name).toEqual(file.output);
  });

  it('les 13 incidents ont chacun leur fichier, avec l’entrée de leur test', () => {
    const files = published();
    expect([...files.keys()]).toEqual(
      Object.keys(INCIDENTS)
        .map((name) => `${name}.json`)
        .sort(),
    );
    for (const reference of REFERENCE_CASES) {
      const { file } = files.get(`${reference.name}.json`) ?? {};
      expect(file?.case).toBe(reference.name);
      expect(file?.test).toBe(reference.test);
      // The input read back from JSON: `undefined` fields are absent, as in any JSON.
      expect(file?.input).toEqual(JSON.parse(JSON.stringify(reference.input())));
    }
  });

  it('deux exports successifs écrivent les mêmes octets', () => {
    const first = tempDir();
    const second = tempDir();
    const paths = exportReferences(first);
    exportReferences(second);
    expect(paths).toHaveLength(13);
    for (const path of paths) {
      const name = path.slice(first.length + 1);
      const bytes = readFileSync(path);
      expect(readFileSync(join(second, name)).equals(bytes), name).toBe(true);
      expect(readFileSync(join(REFERENCES_DIR, name)).equals(bytes), name).toBe(true);
    }
  });

  it('le journal relu donne les faits de l’entrée aux mêmes heures', () => {
    for (const [name, { file }] of published()) {
      const reread = journalFacts(file.journal.lines);
      expect(
        reread.map((fact) => fact.at),
        name,
      ).toEqual(file.journal.facts.map((f) => f.at));
      const inputLogs: readonly LogFact[] = file.input.logs ?? [];
      expect(
        file.journal.facts.map((fact) => fact.at),
        name,
      ).toEqual(inputLogs.map((fact) => fact.at));
    }
  });

  it('les fichiers exportés ne contiennent ni dossier personnel ni tailnet ni adresse ni jeton', () => {
    for (const [name, { text }] of published()) expect(anonymityProblems(text), name).toEqual([]);
  });

  it('un dossier personnel ou un jeton fait échouer la vérification', () => {
    // Built in pieces: check:text refuses a real home folder or tailnet written out in full.
    const home = ['', 'home', 'alice'].join('/');
    const tailnet = ['pc', 'vrai-nom', 'ts', 'net'].join('.');
    const token = `ghp_${'a1B2c3D4e5'.repeat(3)}abcdef`;
    expect(token).toHaveLength(40);
    expect(anonymityProblems(`{"path": "${home}/projets/x"}`)).toEqual([
      `dossier personnel : ${home}`,
    ]);
    expect(anonymityProblems(`{"quote": "token ${token}"}`)).toEqual([`jeton : ${token}`]);
    expect(anonymityProblems('/home/user et machine.tailnet.ts.net, rien de personnel')).toEqual(
      [],
    );
    expect(anonymityProblems(`${tailnet}, a@b.fr, /Users/x, C:\\Users\\x`)).toEqual([
      'dossier personnel : /Users/',
      'dossier personnel : C:\\Users\\',
      `tailnet : ${tailnet}`,
      'adresse : a@b.fr',
    ]);
  });
});
