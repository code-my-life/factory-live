import type { RunVerdict } from '@factory-live/contracts';
import { msg } from '@factory-live/contracts';
import type { Run, Task } from '@factory-live/domain';
import { describe, expect, it } from 'vitest';
import { Hub } from './hub.ts';
import type {
  AgentLogPort,
  CardFilesPort,
  HistoryPort,
  LoggerPort,
  ProfilesPort,
  SessionsPort,
} from './ports.ts';
import { KEEP_FINISHED_MS } from './projection.ts';
import { issueDetail } from './views.ts';

const NOW = Date.parse('2026-11-12T10:00:00Z');
const NOW_S = Math.floor(NOW / 1000);
const silent: LoggerPort = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

const profiles: ProfilesPort = {
  profiles: () => [],
  live: () => null,
  repo: () => null,
  manifest: () => ({ owner: null, projects: {}, profiles: {} }),
  root: () => ({ maxInProgress: 0, maxInProgressPerProfile: 0 }),
  facts: () => null,
  factsStamp: () => '',
};
const sessions: SessionsPort = {
  sessionOfRun: () => null,
  modelUsage: () => [],
  usageSince: () => [],
  transcript: () => [],
  runFacts: () => null,
  sessionsActiveAt: () => null,
};
const files: CardFilesPort = {
  cardLog: () => null,
  claudeTranscripts: () => [],
  evidence: () => null,
  evidenceStamp: () => '',
  gateProofs: () => [],
};
const agentLog: AgentLogPort = { facts: () => null };
const store = {
  board: () => ({ tasks: [], runs: [], links: [], events: [], comments: [] }),
  stations: () => new Map(),
  recentActivity: () => [],
  saveStation: () => {},
  appendActivity: () => {},
  openUnblocks: () => [],
  unblock: () => null,
  activityOfCards: () => [],
} as unknown as HistoryPort;

const task = (patch: Partial<Task>): Task => ({
  id: 't_1a9f0049',
  title: 'impl cv-site#49 : Page Projets',
  body: '',
  assignee: 'coder',
  status: 'done',
  createdAt: NOW_S - 6_000,
  startedAt: NOW_S - 5_000,
  completedAt: NOW_S - 100,
  idempotencyKey: null,
  blockKind: null,
  currentRunId: null,
  workspacePath: null,
  skills: [],
  modelOverride: null,
  providerOverride: null,
  lastHeartbeatAt: null,
  branchName: null,
  consecutiveFailures: 0,
  blockRecurrences: 0,
  lastFailureError: null,
  maxRuntimeSeconds: null,
  ...patch,
});

const run = (id: number, outcome: string): Run => ({
  id,
  taskId: 't_1a9f0049',
  profile: 'coder',
  status: 'done',
  outcome,
  startedAt: NOW_S - 5_000 + id,
  endedAt: NOW_S - 4_000 + id,
  summary: null,
  metadata: {},
  error: null,
});

describe('vues côté socle (#59)', () => {
  it('côté socle, les verdicts des runs d’une carte finie viennent du socle', () => {
    const hub = new Hub(
      {
        owner: 'code-my-life',
        boardName: 'factory',
        dashboardUrl: null,
        addresses: { local: 'http://localhost:8446', tailnet: null },
        heldAfterSeconds: 1_800,
        keepFinishedMs: KEEP_FINISHED_MS,
      },
      {
        store,
        profiles,
        github: null,
        diagnoses: null,
        log: silent,
        now: () => NOW,
        source: 'workflow-core',
      },
    );
    hub.replaceBoard(
      {
        tasks: [task({})],
        runs: [run(1, 'crashed'), run(2, 'completed')],
        links: [],
        events: [],
        comments: [],
      },
      NOW,
    );
    // The verdict the core serves for the crashed run, with no diagnosis service on this side.
    const verdict: RunVerdict = {
      runId: 1,
      finding: 'guard_hook_timeout',
      role: 'cause',
      text: msg('diagnosis.run.blockedAfterRefusals', { count: 3 }),
      sessionId: '20261112_093652_fc383d',
    };
    hub.applyCoreVerdicts('t_1a9f0049', [verdict]);

    const detail = issueDetail(
      {
        hub,
        store,
        sessions,
        profiles,
        github: null,
        files,
        agentLog,
        owner: 'code-my-life',
        boardName: 'factory',
        dashboardUrl: null,
        heldAfterSeconds: 1_800,
        now: () => NOW,
      },
      'cv-site#49',
    );

    const runs = detail?.cards.find((card) => card.id === 't_1a9f0049')?.runs ?? [];
    expect(runs.map((item) => [item.id, item.verdict])).toEqual([
      [1, verdict],
      [2, null],
    ]);
  });
});
