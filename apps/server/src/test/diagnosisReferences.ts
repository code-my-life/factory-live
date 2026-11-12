// The diagnosis reference outputs: for each of the 13 real incidents, the exact input given to
// `diagnose`, Hermès' agent log as `AgentLogReader` reads it, and the diagnosis in the contract's form.
// The core (code-my-life/workflow-core) proves its Python port on these files; it copies them after
// the anonymity check of `anonymityProblems`.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diagnose } from '@factory-live/domain';
import type { DiagnosisInput, LogFact } from '@factory-live/domain';
import { INCIDENTS, REFERENCE_CASES } from '@factory-live/domain/diagnosis-references';
import type { ReferenceCase } from '@factory-live/domain/diagnosis-references';
import { AgentLogReader } from '../adapters/hermes/agentLog.ts';
import { HermesPaths } from '../adapters/hermes/paths.ts';
import { diagnosisView } from '../application/diagnosis.ts';

/** The folder of the reference outputs, at the root of the repository. */
export const REFERENCES_DIR = join(
  import.meta.dirname,
  '../../../../fixtures/diagnosis-references',
);
/** Hermès' time zone on the factory's machine: the one its logs are written in. */
export const TIME_ZONE = 'Europe/Paris';

export interface ReferenceFile {
  readonly case: string;
  readonly test: string;
  readonly input: DiagnosisInput;
  readonly journal: {
    readonly timeZone: string;
    readonly lines: readonly string[];
    readonly facts: readonly LogFact[];
  };
  readonly output: unknown;
}

/**
 * The facts factory-live's log reader draws from an incident's raw lines, attached sessions included,
 * without a source of open sessions: the lines are written to a temporary agent log, read in full.
 */
export function journalFacts(lines: readonly string[]): LogFact[] {
  const dir = mkdtempSync(join(tmpdir(), 'diagnosis-references-'));
  try {
    const logs = join(dir, 'profiles', 'agent', 'logs');
    mkdirSync(logs, { recursive: true });
    writeFileSync(join(logs, 'agent.log'), lines.map((line) => `${line}\n`).join(''));
    const reader = new AgentLogReader(
      new HermesPaths({
        profilesDir: join(dir, 'profiles'),
        boardDir: join(dir, 'board'),
        factoryRepo: join(dir, 'factory'),
      }),
      TIME_ZONE,
    );
    return reader.facts('agent', Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY) ?? [];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function referenceOf(reference: ReferenceCase): ReferenceFile {
  const input = reference.input();
  const lines = INCIDENTS[reference.name].logLines;
  return {
    case: reference.name,
    test: reference.test,
    input,
    journal: { timeZone: TIME_ZONE, lines, facts: journalFacts(lines) },
    output: diagnosisView(diagnose(input)),
  };
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sorted((value as Record<string, unknown>)[key])]),
    );
  return value;
}

/**
 * The text of a file: sorted keys, two spaces, final newline. The em dash, forbidden in the
 * repository's texts, is written `\u2014`: the JSON read stays the same.
 */
export function serialize(file: ReferenceFile): string {
  return `${JSON.stringify(sorted(file), null, 2).replaceAll(String.fromCharCode(0x2014), '\\u2014')}\n`;
}

/** Writes the 13 files `<case>.json` to `dir`; returns their paths, in the order of the incidents. */
export function exportReferences(dir: string = REFERENCES_DIR): string[] {
  mkdirSync(dir, { recursive: true });
  return REFERENCE_CASES.map((reference) => {
    const path = join(dir, `${reference.name}.json`);
    writeFileSync(path, serialize(referenceOf(reference)));
    return path;
  });
}

const FICTIONAL_TAILNET_HOST = 'machine.tailnet.ts.net';
const CHECKS: readonly {
  readonly what: string;
  readonly pattern: RegExp;
  readonly allowed?: string;
}[] = [
  { what: 'dossier personnel', pattern: /\/home\/[A-Za-z_][\w.-]*/g, allowed: '/home/user' },
  { what: 'dossier personnel', pattern: /\/Users\//g },
  { what: 'dossier personnel', pattern: /C:\\{1,2}Users\\{1,2}/gi },
  {
    what: 'tailnet',
    pattern: /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.ts\.net\b/gi,
    allowed: FICTIONAL_TAILNET_HOST,
  },
  { what: 'adresse', pattern: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b/gi },
  { what: 'jeton', pattern: /\b(?:ghp_|gho_|github_pat_|sk-|xoxb-|xoxp-|AKIA)[A-Za-z0-9_-]{8,}/g },
];

/** What an exported text must not hold: a home folder, a real tailnet, an address, a token. */
export function anonymityProblems(text: string): string[] {
  const problems: string[] = [];
  for (const { what, pattern, allowed } of CHECKS)
    for (const [found] of text.matchAll(pattern))
      if (found !== allowed) problems.push(`${what} : ${found}`);
  return problems;
}
