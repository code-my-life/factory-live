import { describe, expect, it } from 'vitest';
import { aLink, aRun, aTask, anEvent } from './fixtures.test-helpers.ts';
import type { Board } from './hermes.ts';
import {
  finishedIssues,
  gateVerdicts,
  humanResponseMinutes,
  median,
  stationMinutes,
} from './stats.ts';

const IMPL = aTask({
  id: 't_impl0001',
  title: 'impl claude-cockpit#52',
  assignee: 'gate',
  status: 'done',
});

function board(patch: Partial<Board>): Board {
  return { tasks: [IMPL], runs: [], events: [], links: [], ...patch };
}

describe('median', () => {
  it('donne la valeur du milieu, ou la moyenne des deux du milieu', () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('gateVerdicts', () => {
  it('associe chaque demande de revue au verdict de la gate qui suit', () => {
    const verdicts = gateVerdicts(
      board({
        runs: [
          aRun({
            id: 1,
            taskId: IMPL.id,
            profile: 'coder',
            outcome: 'review_requested',
            metadata: { harness: 'coder' },
          }),
          aRun({
            id: 2,
            taskId: IMPL.id,
            profile: 'gate',
            outcome: 'changes_requested',
            endedAt: 2_000,
          }),
          aRun({ id: 3, taskId: IMPL.id, profile: 'coder', outcome: 'blocked' }),
          aRun({
            id: 4,
            taskId: IMPL.id,
            profile: 'coder-claude',
            outcome: 'review_requested',
            metadata: { harness: 'coder-claude', claude_model: 'claude-opus-5-5' },
          }),
          aRun({ id: 5, taskId: IMPL.id, profile: 'gate', outcome: 'blocked', endedAt: 2_500 }),
          aRun({ id: 6, taskId: IMPL.id, profile: 'gate', outcome: 'completed', endedAt: 3_000 }),
        ],
      }),
    );
    expect(verdicts).toEqual([
      {
        cardId: IMPL.id,
        implementerRunId: 1,
        implementer: 'coder',
        harness: 'coder',
        claudeModel: null,
        passed: false,
        at: 2_000,
      },
      {
        cardId: IMPL.id,
        implementerRunId: 4,
        implementer: 'coder-claude',
        harness: 'coder-claude',
        claudeModel: 'claude-opus-5-5',
        passed: true,
        at: 3_000,
      },
    ]);
  });

  it('réduit le harnais à son nom et respecte la période', () => {
    const runs = [
      aRun({
        id: 1,
        taskId: IMPL.id,
        profile: 'coder',
        outcome: 'review_requested',
        metadata: { harness: 'operateur (Claude Code, demandé par cddev le 2026-10-20)' },
      }),
      aRun({ id: 2, taskId: IMPL.id, profile: 'gate', outcome: 'completed', endedAt: 5_000 }),
    ];
    expect(gateVerdicts(board({ runs }))[0]?.harness).toBe('operateur');
    expect(gateVerdicts(board({ runs }), 6_000)).toEqual([]);
  });
});

describe('stationMinutes', () => {
  it('range la durée des runs terminés par station', () => {
    const brief = aTask({
      id: 't_brief001',
      title: 'brief claude-cockpit#52',
      assignee: 'coordinator',
      status: 'done',
    });
    const result = stationMinutes({
      tasks: [brief, IMPL],
      runs: [
        aRun({ id: 1, taskId: brief.id, profile: 'coordinator', startedAt: 0, endedAt: 600 }),
        aRun({ id: 2, taskId: IMPL.id, profile: 'coder', startedAt: 600, endedAt: 3_000 }),
        aRun({ id: 3, taskId: IMPL.id, profile: 'gate', startedAt: 3_000, endedAt: 3_900 }),
        aRun({ id: 4, taskId: IMPL.id, profile: 'coder', startedAt: 4_000, endedAt: null }),
      ],
      events: [],
      links: [aLink(brief.id, IMPL.id)],
    });
    expect(Object.fromEntries(result)).toEqual({ brief: [10], implementation: [40], gate: [15] });
  });
});

describe('finishedIssues', () => {
  it('donne le délai d’une issue livrée, de la première carte à la release terminée', () => {
    const brief = aTask({
      id: 't_brief001',
      title: 'brief claude-cockpit#52',
      status: 'archived',
      createdAt: 0,
      completedAt: 600,
    });
    const release = aTask({
      id: 't_rel00001',
      title: 'release claude-cockpit#52',
      status: 'archived',
      assignee: 'release',
      createdAt: 900,
      completedAt: 7_200,
    });
    const result = finishedIssues({
      tasks: [brief, { ...IMPL, status: 'archived', completedAt: 3_000 }, release],
      runs: [],
      events: [],
      links: [aLink(brief.id, IMPL.id), aLink(brief.id, release.id)],
    });
    expect(result).toEqual([
      {
        key: 'claude-cockpit#52',
        outcome: 'merged',
        startedAt: 0,
        finishedAt: 7_200,
        leadTimeMinutes: 120,
      },
    ]);
  });

  it('écarte les issues encore en cours', () => {
    const brief = aTask({ id: 't_brief001', title: 'brief claude-cockpit#53', status: 'running' });
    expect(finishedIssues({ tasks: [brief], runs: [], events: [], links: [] })).toEqual([]);
  });
});

describe('humanResponseMinutes', () => {
  it('mesure du blocage au déblocage, hors dépendances', () => {
    const result = humanResponseMinutes(
      board({
        events: [
          anEvent({
            id: 1,
            taskId: IMPL.id,
            kind: 'blocked',
            payload: { kind: 'needs_input' },
            createdAt: 0,
          }),
          anEvent({
            id: 2,
            taskId: IMPL.id,
            kind: 'blocked',
            payload: { kind: 'needs_input' },
            createdAt: 60,
          }),
          anEvent({ id: 3, taskId: IMPL.id, kind: 'unblocked', createdAt: 1_800 }),
          anEvent({
            id: 4,
            taskId: IMPL.id,
            kind: 'blocked',
            payload: { kind: 'dependency' },
            createdAt: 2_000,
          }),
          anEvent({ id: 5, taskId: IMPL.id, kind: 'unblocked', createdAt: 2_600 }),
          anEvent({ id: 6, taskId: IMPL.id, kind: 'blocked', payload: {}, createdAt: 3_000 }),
        ],
      }),
    );
    expect(result).toEqual({ blocks: 3, responses: [30] });
  });
});
