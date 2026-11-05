import { describe, expect, it } from 'vitest';
import { parseWorkflowSheet } from './workflow.ts';
import type { WorkflowSheet } from './workflow.ts';

/** The code line's sheet, as `apps/web/src/features/line/graph/workflows/code-line.json` holds it. */
const proof = (lane: string, row: number, types: string[]) => ({
  key: `gate:${lane}`,
  label: lane,
  icon: 'shield-check',
  kind: 'script' as const,
  col: 2,
  row,
  group: 'gate',
  types,
});
const CODE_LINE: WorkflowSheet = {
  item: { type: 'issue', label: 'Issue' },
  groups: [{ key: 'gate', label: 'Gate', icon: 'shield-check' }],
  stations: [
    { key: 'intake', label: 'Intake', icon: 'issue-opened', kind: 'script', col: 0, row: 0 },
    { key: 'brief', label: 'Brief', icon: 'workflow', kind: 'ai', col: 0, row: 1 },
    { key: 'implementation', label: 'Implémentation', icon: 'code', kind: 'ai', col: 1, row: 1 },
    proof('failfirst', 1, ['bug', 'interface', 'fonctionnalite']),
    proof('sabotage', 2, ['tests']),
    proof('invariance', 3, ['maintenance']),
    proof('documents', 4, ['documentation']),
    { key: 'review', label: 'Ta revue', icon: 'eye', kind: 'owner', col: 3, row: 1 },
    { key: 'merge', label: 'Fusion', icon: 'git-merge', kind: 'github', col: 3, row: 2 },
    { key: 'ci', label: 'CI de main', icon: 'play', kind: 'github', col: 3, row: 3 },
    { key: 'deploy', label: 'Déploiement', icon: 'rocket', kind: 'script', col: 3, row: 4 },
    { key: 'done', label: 'Terminé', icon: 'check-circle', kind: 'end', col: 3, row: 5 },
    { key: 'diagnostic', label: 'Diagnostic', icon: 'search', kind: 'ai', col: 0, row: 2 },
  ],
  edges: [
    { from: 'intake', to: 'brief', kind: 'line' },
    { from: 'brief', to: 'implementation', kind: 'line' },
    ...['failfirst', 'sabotage', 'invariance', 'documents'].map((lane) => ({
      from: 'implementation',
      to: `gate:${lane}`,
      kind: 'fan' as const,
    })),
    ...['failfirst', 'sabotage', 'invariance', 'documents'].map((lane) => ({
      from: `gate:${lane}`,
      to: 'review',
      kind: 'fan' as const,
    })),
    { from: 'review', to: 'merge', kind: 'line' },
    { from: 'merge', to: 'ci', kind: 'line' },
    { from: 'ci', to: 'deploy', kind: 'line' },
    { from: 'deploy', to: 'done', kind: 'line' },
    { from: 'brief', to: 'diagnostic', kind: 'branch', id: 'diag:in' },
    { from: 'diagnostic', to: 'done', kind: 'branch', id: 'diag:out' },
    { from: 'gate', to: 'implementation', kind: 'return', id: 'loop:gate' },
    { from: 'review', to: 'implementation', kind: 'return', id: 'loop:review' },
    { from: 'ci', to: 'review', kind: 'return', id: 'loop:revert' },
  ],
  models: ['brief', 'implementation', 'diagnostic'],
};

describe('parseWorkflowSheet', () => {
  it('une fiche invalide est refusée et dit pourquoi', () => {
    const refused = (sheet: unknown, ...named: string[]) => {
      const result = parseWorkflowSheet(sheet);
      expect(result.ok).toBe(false);
      const error = result.ok ? '' : result.error;
      for (const name of named) expect(error).toContain(name);
    };

    // The code line's sheet is accepted as it is.
    const accepted = parseWorkflowSheet(CODE_LINE);
    expect(accepted).toEqual({ ok: true, sheet: CODE_LINE });

    // A station twice: the message names it.
    refused(
      {
        ...CODE_LINE,
        stations: [
          ...CODE_LINE.stations,
          { key: 'merge', label: 'Fusion', icon: 'git-merge', kind: 'github', col: 4, row: 1 },
        ],
      },
      'duplicate station',
      '"merge"',
    );
    // A link to an unknown station: the message names the link and the station.
    refused(
      {
        ...CODE_LINE,
        edges: [...CODE_LINE.edges, { from: 'ci', to: 'release', kind: 'line', id: 'line:ci2' }],
      },
      '"line:ci2"',
      '"release"',
    );
    refused({ ...CODE_LINE, edges: [{ from: 'nowhere', to: 'brief', kind: 'line' }] }, '"nowhere"');
    // Two stations on the same cell: the message names both.
    refused(
      {
        ...CODE_LINE,
        stations: [
          ...CODE_LINE.stations,
          { key: 'release', label: 'Release', icon: 'tag', kind: 'script', col: 3, row: 2 },
        ],
      },
      '"merge"',
      '"release"',
      'col 3, row 2',
    );
    // A fed station that is not on the sheet.
    refused({ ...CODE_LINE, models: [...CODE_LINE.models, 'triage'] }, '"triage"');
    // The providers' box keeps its key.
    refused(
      {
        ...CODE_LINE,
        stations: [
          ...CODE_LINE.stations,
          { key: 'models', label: 'Models', icon: 'cpu', kind: 'ai', col: 5, row: 1 },
        ],
      },
      '"models"',
    );
    // A group's members share one kind, and a station names a known group.
    refused(
      {
        ...CODE_LINE,
        stations: CODE_LINE.stations.map((station) =>
          station.key === 'gate:sabotage' ? { ...station, kind: 'ai' } : station,
        ),
      },
      '"gate"',
    );
    refused(
      {
        ...CODE_LINE,
        stations: CODE_LINE.stations.map((station) =>
          station.key === 'gate:sabotage' ? { ...station, group: 'proofs' } : station,
        ),
      },
      '"gate:sabotage"',
      '"proofs"',
    );
    // Not a sheet at all, or a station of an unknown kind: refused, never thrown.
    refused(null);
    refused('{');
    refused(
      {
        ...CODE_LINE,
        stations: [{ ...CODE_LINE.stations[0], kind: 'robot' }],
      },
      'stations.0.kind',
    );
    const hostile = {
      get item(): never {
        throw new Error('no item here');
      },
    };
    expect(() => parseWorkflowSheet(hostile)).not.toThrow();
    refused(hostile);
  });
});
