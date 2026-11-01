import { mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDir } from '../../test/hermes-fixtures.ts';
import type { TempDir } from '../../test/hermes-fixtures.ts';
import { CardFiles, claudeTranscriptFiles } from './files.ts';
import { HermesPaths } from './paths.ts';

function makeTranscriptFile(dir: string, filename: string, content: string): string {
  const path = join(dir, filename);
  writeFileSync(path, content);
  return path;
}

let dir: TempDir;
let board: string;
let files: CardFiles;
let claudeProjects: string;

beforeEach(() => {
  dir = tempDir();
  board = join(dir.path, 'board');
  mkdirSync(board, { recursive: true });
  claudeProjects = join(dir.path, 'claude-projects-myworkdir');
  mkdirSync(claudeProjects, { recursive: true });
  const prefixedDir = join(claudeProjects, 'myworkdir');
  mkdirSync(prefixedDir, { recursive: true });
  files = new CardFiles(
    board,
    claudeProjects,
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

  it("s'arrête à 50 fichiers", () => {
    const evidence = join(board, 'evidence', 't_03d9d40d');
    mkdirSync(evidence, { recursive: true });
    for (let index = 0; index < 60; index += 1) {
      writeFileSync(join(evidence, String(index).padStart(2, '0') + '.txt'), '');
    }
    expect(files.evidence('t_03d9d40d')).toHaveLength(50);
  });

  describe('claudeTranscriptFiles', () => {
    beforeEach(() => {
      dir = tempDir();
      board = join(dir.path, 'board');
      mkdirSync(board, { recursive: true });
      claudeProjects = join(dir.path, 'claude-projects-myworkdir');
      mkdirSync(claudeProjects, { recursive: true });
      const prefixedDir = join(claudeProjects, 'myworkdir');
      mkdirSync(prefixedDir, { recursive: true });
      files = new CardFiles(
        board,
        claudeProjects,
        new HermesPaths({
          profilesDir: join(dir.path, 'profiles'),
          boardDir: board,
          factoryRepo: join(dir.path, 'factory'),
        }),
      );
    });

    it('extrait le nom depuis le custom-title et les timestamps', () => {
      const transcriptContent = [
        '{ "type": "custom-title", "customTitle": "Implementation : projet X" }',
        '{ "type": "tool_call", "name": "kanban_show", "timestamp": "2026-10-30T10:00:00Z" }',
        '{ "type": "tool_result", "timestamp": "2026-10-30T10:01:00Z" }',
        '{ "type": "user", "timestamp": "2026-10-30T10:02:00Z" }',
      ].join('\n');
      makeTranscriptFile(claudeProjects, 'myworkdir/session1.jsonl', transcriptContent);

      const result = claudeTranscriptFiles(claudeProjects, 'myworkdir', 0, Date.now() + 86400000);

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Implementation : projet X');
      expect(result[0]!.startedAt).toBeGreaterThan(0);
      expect(result[0]!.endedAt).toBeGreaterThan(0);
    });

    it("rend null quand il n'y a pas de custom-title", () => {
      const transcriptContent = [
        '{ "type": "tool_call", "name": "kanban_show", "timestamp": "2026-10-30T10:00:00Z" }',
        '{ "type": "user", "timestamp": "2026-10-30T10:02:00Z" }',
      ].join('\n');
      makeTranscriptFile(claudeProjects, 'myworkdir/session1.jsonl', transcriptContent);

      const result = claudeTranscriptFiles(claudeProjects, 'myworkdir', 0, Date.now() + 86400000);

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBeNull();
      expect(result[0]!.startedAt).toBeGreaterThan(0);
    });

    it('classe par mtime lorsque modifie apres le lancement', () => {
      // Create two sessions: first launched earlier but modified later
      const firstSession = '{ "type": "user", "timestamp": "2026-10-30T10:00:00Z" }';
      const secondSession =
        '{ "type": "custom-title", "customTitle": "Correction : fixes" }' +
        '\n' +
        '{ "type": "user", "timestamp": "2026-10-30T10:01:00Z" }';
      makeTranscriptFile(claudeProjects, 'myworkdir/session-early.jsonl', firstSession);
      makeTranscriptFile(claudeProjects, 'myworkdir/session-late.jsonl', secondSession);

      const result = claudeTranscriptFiles(claudeProjects, 'myworkdir', 0, Date.now() + 86400000);

      // Files are sorted by mtime (modification time)
      expect(result).toHaveLength(2);
      // The first file (session-early) has no custom-title, name should be null
      expect(result[0]!.name).toBeNull();
      // The second file (session-late) has custom-title, name should be set
      expect(result[1]!.name).not.toBeNull();
    });

    it('ignores invalid JSON lines and continues parsing', () => {
      // A transcript with an invalid JSON line in the middle
      const transcriptContent = [
        '{ "type": "custom-title", "customTitle": "Implementation : test" }',
        'this is not valid json at all',
        '{ "type": "user", "timestamp": "2026-10-30T10:00:00Z" }',
      ].join('\n');
      makeTranscriptFile(claudeProjects, 'myworkdir/session-invalid.jsonl', transcriptContent);

      const result = claudeTranscriptFiles(claudeProjects, 'myworkdir', 0, Date.now() + 86400000);

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Implementation : test');
      expect(result[0]!.startedAt).toBeGreaterThan(0);
      expect(result[0]!.endedAt).toBeGreaterThan(0);
    });

    it('handles a truncated JSON line as a lane still in progress', () => {
      // A lane in progress: the last line is a partial JSON record (truncated mid-write)
      const transcriptContent = [
        '{ "type": "user", "timestamp": "2026-10-30T10:00:00Z" }',
        '{ "type": "custom-title", "customTitle": "Correction : still running" }',
        '{ "type": "assistant", "timestamp": "2026-10-30T10:01:00Z" }',
        '{ "type": "tool_call", "timestamp": "2026-10-30T10:02:00Z" ',
      ].join('\n');
      makeTranscriptFile(claudeProjects, 'myworkdir/session-truncated.jsonl', transcriptContent);

      const result = claudeTranscriptFiles(claudeProjects, 'myworkdir', 0, Date.now() + 86400000);

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Correction : still running');
      expect(result[0]!.startedAt).toBeGreaterThan(0);
      expect(result[0]!.endedAt).toBeGreaterThan(0);
    });

    it('le nom de la lane vient de son enregistrement custom-title', () => {
      // Test that the lane name is read from the custom-title record
      const transcriptContent = [
        '{ "type": "user", "timestamp": "2026-10-30T10:00:00Z" }',
        '{ "type": "custom-title", "customTitle": "Implémentation : vue ÉQUIPE groupée par projet" }',
        '{ "type": "assistant", "timestamp": "2026-10-30T10:01:00Z" }',
      ].join('\n');
      makeTranscriptFile(claudeProjects, 'myworkdir/session-custom-title.jsonl', transcriptContent);

      const result = claudeTranscriptFiles(claudeProjects, 'myworkdir', 0, Date.now() + 86400000);

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Implémentation : vue ÉQUIPE groupée par projet');
    });

    it('les lanes sont rangées par heure de début', () => {
      // Test that lanes are sorted by startedAt (launch time), not modification time
      const earlySession = [
        '{ "type": "custom-title", "customTitle": "Correction : early" }',
        '{ "type": "user", "timestamp": "2026-10-30T10:00:00Z" }',
      ].join('\n');
      const lateSession = [
        '{ "type": "custom-title", "customTitle": "Implémentation : late" }',
        '{ "type": "user", "timestamp": "2026-10-30T11:00:00Z" }',
      ].join('\n');
      // Create early session file first (older mtime)
      makeTranscriptFile(claudeProjects, 'myworkdir/session-late.jsonl', lateSession);
      // Create late session file second (newer mtime)
      makeTranscriptFile(claudeProjects, 'myworkdir/session-early.jsonl', earlySession);

      const result = claudeTranscriptFiles(claudeProjects, 'myworkdir', 0, Date.now() + 86400000);

      expect(result).toHaveLength(2);
      // Should be sorted by startedAt (from timestamp), not mtime
      // The early session has timestamp 10:00, late session has 11:00
      // So early should come first despite being created second (newer mtime)
      expect(result[0]!.name).toBe('Correction : early');
      expect(result[1]!.name).toBe('Implémentation : late');
    });
  });

  describe('CardFiles.claudeTranscripts', () => {
    beforeEach(() => {
      dir = tempDir();
      board = join(dir.path, 'board');
      mkdirSync(board, { recursive: true });
      claudeProjects = join(dir.path, 'claude-projects-myworkdir');
      mkdirSync(claudeProjects, { recursive: true });
      const prefixedDir = join(claudeProjects, 'myworkdir');
      mkdirSync(prefixedDir, { recursive: true });
      files = new CardFiles(
        board,
        claudeProjects,
        new HermesPaths({
          profilesDir: join(dir.path, 'profiles'),
          boardDir: board,
          factoryRepo: join(dir.path, 'factory'),
        }),
      );
    });

    it('retourne les lanes avec nom, timestamps et cout', () => {
      const transcriptContent = [
        '{ "type": "custom-title", "customTitle": "Correction : fixes" }',
        '{ "type": "user", "timestamp": "2026-10-30T10:00:00Z" }',
      ].join('\n');
      makeTranscriptFile(claudeProjects, 'myworkdir/session1.jsonl', transcriptContent);

      const result = files.claudeTranscripts('myworkdir', 0, Date.now() + 86400000);

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Correction : fixes');
      expect(result[0]!.startedAt).toBeGreaterThan(0);
      expect(result[0]!.endedAt).toBeGreaterThan(0);
      expect(result[0]!.entries).toHaveLength(0);
      expect(result[0]!.costUsd).toBeNull();
    });
  });
});
