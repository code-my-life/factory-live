import { describe, expect, it } from 'vitest';
import { transcripts, historyStats } from '../application/views.ts';
import { harness, NOW } from './harness.ts';
import type { Harness } from './harness.ts';
import type { ViewDeps } from '../application/views.ts';

describe('transcripts view', () => {
  it('identifie la dernière lane en cours quand le run tourne encore', () => {
    const h: Harness = harness();
    // Insert a task with workspacePath
    h.writer
      .prepare(
        "INSERT INTO tasks (id, title, status, assignee, workspace_path, created_at) VALUES ('t_run_in_prog', 'test', 'running', 'coder', '/tmp/ws', 1000)",
      )
      .run();
    // Insert an in-progress run (ended_at IS NULL)
    h.writer
      .prepare(
        "INSERT INTO task_runs (id, task_id, profile, status, started_at, ended_at) VALUES (100, 't_run_in_prog', 'coder', 'running', 1000, NULL)",
      )
      .run();
    h.syncKanban();

    // Mock claudeTranscripts to return two lanes
    const mockLanes = [
      {
        entries: [
          {
            id: 'entry-1',
            at: '2026-10-31T11:15:22.000Z',
            role: 'user',
            text: 'Test entry',
            toolName: null,
            model: null,
            status: null,
          },
        ],
        name: 'First Lane',
        startedAt: 1000000,
        endedAt: 1005000,
        costUsd: 0.1,
      },
      {
        entries: [
          {
            id: 'entry-2',
            at: '2026-10-31T11:16:00.000Z',
            role: 'assistant',
            text: 'Response',
            toolName: null,
            model: null,
            status: null,
          },
        ],
        name: 'Second Lane (running)',
        startedAt: 1010000,
        endedAt: 1015000, // file has a timestamp, but lane is last-launched on a running run
        costUsd: 0.2,
      },
    ];

    // Spy on files.claudeTranscripts
    const deps = {
      ...h.hub,
      hub: h.hub,
      store: h.store,
      sessions: {
        sessionOfRun: () => null,
        transcript: () => [],
        usageSince: () => [],
      },
      profiles: {
        manifest: () => ({ profiles: {} }),
        live: () => null,
        repo: () => null,
        facts: () => null,
      },
      github: null,
      files: {
        evidence: () => null,
        evidenceStamp: () => '-',
        cardLog: () => null,
        claudeTranscripts: () => mockLanes,
      },
      agentLog: null,
      owner: 'code-my-life',
      boardName: 'factory',
      dashboardUrl: null,
      heldAfterSeconds: 1800,
      now: () => NOW,
    } as unknown as ViewDeps;

    const result = transcripts(deps, 100);

    expect(result).not.toBeNull();
    // hermes session + 2 claude-code lanes
    expect(result).toHaveLength(3);

    // First lane is completed (endedAt kept)
    expect(result![1]!.endedAt).toBe(1005000);

    // Second lane (last started on in-progress run) has endedAt: null ("en cours")
    expect(result![2]!.endedAt).toBeNull();

    h.close();
  });

  it("garde l'heure de fin de toutes les lanes quand le run est terminé", () => {
    const h: Harness = harness();
    h.writer
      .prepare(
        "INSERT INTO tasks (id, title, status, assignee, workspace_path, created_at) VALUES ('t_run_done', 'test', 'done', 'coder', '/tmp/ws', 1000)",
      )
      .run();
    // Insert a completed run (ended_at IS NOT NULL)
    h.writer
      .prepare(
        "INSERT INTO task_runs (id, task_id, profile, status, started_at, ended_at) VALUES (200, 't_run_done', 'coder', 'done', 1000, 2000)",
      )
      .run();
    h.syncKanban();

    const mockLanes = [
      {
        entries: [
          {
            id: 'entry-1',
            at: '2026-10-31T11:15:22.000Z',
            role: 'user',
            text: 'Test entry',
            toolName: null,
            model: null,
            status: null,
          },
        ],
        name: 'First Lane',
        startedAt: 1000000,
        endedAt: 1005000,
        costUsd: 0.1,
      },
      {
        entries: [
          {
            id: 'entry-2',
            at: '2026-10-31T11:16:00.000Z',
            role: 'assistant',
            text: 'Response',
            toolName: null,
            model: null,
            status: null,
          },
        ],
        name: 'Second Lane',
        startedAt: 1010000,
        endedAt: 1015000,
        costUsd: 0.2,
      },
    ];

    const deps = {
      ...h.hub,
      hub: h.hub,
      store: h.store,
      sessions: {
        sessionOfRun: () => null,
        transcript: () => [],
        usageSince: () => [],
      },
      profiles: {
        manifest: () => ({ profiles: {} }),
        live: () => null,
        repo: () => null,
        facts: () => null,
      },
      github: null,
      files: {
        evidence: () => null,
        evidenceStamp: () => '-',
        cardLog: () => null,
        claudeTranscripts: () => mockLanes,
      },
      agentLog: null,
      owner: 'code-my-life',
      boardName: 'factory',
      dashboardUrl: null,
      heldAfterSeconds: 1800,
      now: () => NOW,
    } as unknown as ViewDeps;

    const result = transcripts(deps, 200);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(3);

    // Completed run: all lanes keep their endedAt timestamp
    expect(result![1]!.endedAt).toBe(1005000);
    expect(result![2]!.endedAt).toBe(1015000);

    h.close();
  });
});

describe('historyStats', () => {
  it('calcule les stats sur les issues terminées', () => {
    const h: Harness = harness();
    const deps = {
      ...h.hub,
      hub: h.hub,
      store: h.store,
      sessions: {
        sessionOfRun: () => null,
        transcript: () => [],
        usageSince: () => [],
      },
      profiles: {
        manifest: () => ({ profiles: {} }),
        live: () => null,
        repo: () => null,
        facts: () => null,
      },
      github: null,
      files: {
        evidence: () => null,
        evidenceStamp: () => '-',
        cardLog: () => null,
        claudeTranscripts: () => [],
      },
      agentLog: null,
      owner: 'code-my-life',
      boardName: 'factory',
      dashboardUrl: null,
      heldAfterSeconds: 1800,
      now: () => NOW,
    } as unknown as ViewDeps;

    const result = historyStats(deps, 30);

    expect(result.periodDays).toBe(30);
    expect(typeof result.issuesDone).toBe('number');
    expect(
      result.medianLeadTimeMinutes === null || typeof result.medianLeadTimeMinutes === 'number',
    ).toBe(true);
    expect(Array.isArray(result.stationMinutes)).toBe(true);
    expect(Array.isArray(result.gatePassRate)).toBe(true);

    h.close();
  });
});
