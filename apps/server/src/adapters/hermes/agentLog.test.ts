import { appendFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDir } from '../../test/hermes-fixtures.ts';
import type { TempDir } from '../../test/hermes-fixtures.ts';
import { AgentLogReader, zonedEpoch } from './agentLog.ts';
import { HermesPaths } from './paths.ts';

const PARIS = 'Europe/Paris';
const SESSION = '20261029_093652_fc383d';

/** Les lignes de factory-live#2, telles qu'Hermès les a écrites (heure de Paris, sans fuseau). */
const TIMEOUT = `2026-10-29 09:46:10,160 WARNING [${SESSION}] hermes_cli.plugins: Hook 'pre_tool_call' callback pre_tool timed out after 30s \u2014 skipping`;
const EXECUTOR = `2026-10-29 09:46:10,161 INFO [${SESSION}] agent.tool_executor: tool terminal completed (30.01s, 72 chars)`;
const HTTP = '2026-10-29 09:46:11,000 INFO httpx2: HTTP Request: POST http://127.0.0.1:8081/mcp';

let dir: TempDir;
let logs: string;
let reader: AgentLogReader;

beforeEach(() => {
  dir = tempDir();
  logs = join(dir.path, 'profiles', 'coder', 'logs');
  mkdirSync(logs, { recursive: true });
  reader = new AgentLogReader(
    new HermesPaths({
      profilesDir: join(dir.path, 'profiles'),
      boardDir: join(dir.path, 'board'),
      factoryRepo: join(dir.path, 'factory'),
    }),
    PARIS,
  );
});

afterEach(() => dir.remove());

const ALL = [0, 4_000_000_000] as const;

describe('AgentLogReader', () => {
  it('garde les lignes cataloguées, datées à l’heure de Paris', () => {
    writeFileSync(
      join(logs, 'agent.log'),
      `${HTTP}\n${TIMEOUT}\n${EXECUTOR}\nTraceback (most recent call last):\n`,
    );
    const facts = reader.facts('coder', ...ALL);
    expect(facts).toEqual([
      expect.objectContaining({
        kind: 'hook_timeout',
        callback: 'pre_tool',
        seconds: 30,
        sessionId: SESSION,
        at: Date.parse('2026-10-29T08:46:10.160Z') / 1000,
      }),
    ]);
    expect(reader.facts('coder', 0, Date.parse('2026-10-29T08:00:00Z') / 1000)).toEqual([]);
  });

  it('reprend où il s’était arrêté, une ligne inachevée comprise', () => {
    const path = join(logs, 'agent.log');
    writeFileSync(path, `${TIMEOUT}\n${TIMEOUT.slice(0, 40)}`);
    expect(reader.facts('coder', ...ALL)).toHaveLength(1);
    appendFileSync(path, `${TIMEOUT.slice(40)}\n`);
    expect(reader.facts('coder', ...ALL)).toHaveLength(2);
    appendFileSync(path, `${TIMEOUT.replace('09:46:10', '09:47:00')}\n`);
    expect(reader.facts('coder', ...ALL)?.map((fact) => fact.at)).toEqual([
      Date.parse('2026-10-29T08:46:10.160Z') / 1000,
      Date.parse('2026-10-29T08:46:10.160Z') / 1000,
      Date.parse('2026-10-29T08:47:00.160Z') / 1000,
    ]);
  });

  it('suit la rotation : l’ancien fichier, puis le nouveau', () => {
    const path = join(logs, 'agent.log');
    writeFileSync(path, `${TIMEOUT}\n`);
    expect(reader.facts('coder', ...ALL)).toHaveLength(1);
    renameSync(path, join(logs, 'agent.log.1'));
    writeFileSync(path, `${TIMEOUT.replace('09:46:10', '10:00:00')}\n`);
    expect(reader.facts('coder', ...ALL)?.map((fact) => fact.at)).toEqual([
      Date.parse('2026-10-29T08:46:10.160Z') / 1000,
      Date.parse('2026-10-29T09:00:00.160Z') / 1000,
    ]);
  });

  it('rattache une ligne sans session à l’outil qui la suit de près, jamais au-delà', () => {
    const bare = (time: string) =>
      `2026-10-29 ${time},000 WARNING hermes_cli.plugins: Hook 'pre_tool_call' callback guard timed out after 30s \u2014 skipping`;
    writeFileSync(
      join(logs, 'agent.log'),
      [
        bare('09:00:00'),
        `2026-10-29 09:00:01,500 INFO [${SESSION}] agent.tool_executor: tool terminal completed (30.0s, 1 chars)`,
        bare('09:10:00'),
        HTTP.replace('09:46:11', '09:10:05'),
        bare('09:20:00'),
      ].join('\n') + '\n',
    );
    expect(reader.facts('coder', ...ALL)?.map((fact) => fact.sessionId)).toEqual([
      SESSION,
      null,
      null,
    ]);
  });

  it('rend null quand l’agent n’a pas de journal', () => {
    expect(reader.facts('inconnu', ...ALL)).toBeNull();
    expect(reader.facts('../coder', ...ALL)).toBeNull();
  });
});

describe('zonedEpoch', () => {
  it('lève l’ambiguïté du passage à l’heure d’hiver par l’ordre du journal', () => {
    // 2026-10-25 : 03:00 CEST redevient 02:00 CET ; 02:30 existe deux fois.
    const first = zonedEpoch('2026-10-25 02:30:00', 0, PARIS, null);
    expect(first).toBe(Date.parse('2026-10-25T00:30:00Z') / 1000);
    const second = zonedEpoch('2026-10-25 02:30:00', 0, PARIS, (first as number) + 1_800);
    expect(second).toBe(Date.parse('2026-10-25T01:30:00Z') / 1000);
    expect(zonedEpoch('2026-10-25 03:30:00', 0, PARIS, second)).toBe(
      Date.parse('2026-10-25T02:30:00Z') / 1000,
    );
  });

  it('date une heure sautée au printemps comme l’horloge d’avant, et refuse un format inconnu', () => {
    expect(zonedEpoch('2026-03-29 02:30:00', 0, PARIS)).toBe(
      Date.parse('2026-03-29T01:30:00Z') / 1000,
    );
    expect(zonedEpoch('2026-07-14 12:00:00', 250, PARIS)).toBe(
      Date.parse('2026-07-14T10:00:00.250Z') / 1000,
    );
    expect(zonedEpoch('29/10/2026 09:46:10', 0, PARIS)).toBeNull();
  });
});
