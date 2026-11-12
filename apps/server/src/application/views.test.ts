import type { Diagnosis, FindingCode, RunVerdict } from '@factory-live/contracts';
import { msg } from '@factory-live/contracts';
import type { Run, Task } from '@factory-live/domain';
import { describe, expect, it } from 'vitest';
import { Hub } from './hub.ts';
import type {
  AgentLogPort,
  CardFilesPort,
  CoreInterventionState,
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

const VERDICT: RunVerdict = {
  runId: 1,
  finding: 'guard_hook_timeout',
  role: 'cause',
  text: msg('diagnosis.run.blockedAfterRefusals', { count: 3 }),
  sessionId: '20261112_093652_fc383d',
};

function coreHub(): Hub {
  return new Hub(
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
}

function announced(id: string, openedAt: number): CoreInterventionState {
  return {
    id,
    kind: 'needs_input',
    cardId: 't_1a9f0049',
    eventId: Number(id.split(':')[2]),
    openedAt,
    profile: 'coder',
    severity: 'critical',
    push: true,
    title: 'Quelle base ?',
    question: 'Quelle base ?',
    actions: [{ kind: 'unblock' }],
  };
}

/** A diagnosis reduced to what the follow-up compares: its primary finding's code. */
function diagnosisWith(code: FindingCode): Diagnosis {
  return { primary: { code } } as unknown as Diagnosis;
}

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

  it('de nouveaux verdicts du socle font relire le détail d’une issue', () => {
    const hub = coreHub();
    hub.replaceBoard(
      { tasks: [task({})], runs: [run(1, 'crashed')], links: [], events: [], comments: [] },
      NOW,
    );
    const boards: unknown[] = [];
    hub.subscribe((event) => {
      if (event.type === 'board') boards.push(event);
    });
    hub.flush();
    boards.length = 0;

    // The board does not change, but the verdicts do: a board event tells the app to read the issue again.
    hub.applyCoreVerdicts('t_1a9f0049', [VERDICT]);
    hub.flush();
    expect(boards).toHaveLength(1);
    // The same verdicts again: nothing to tell.
    hub.applyCoreVerdicts('t_1a9f0049', [VERDICT]);
    hub.flush();
    expect(boards).toHaveLength(1);
  });

  it('côté socle, un déblocage qui rebloque pour la même cause le dit', () => {
    const hub = coreHub();
    const blocked = task({ status: 'blocked', blockKind: 'needs_input', completedAt: null });
    hub.replaceBoard(
      { tasks: [blocked], runs: [run(1, 'blocked')], links: [], events: [], comments: [] },
      NOW,
    );
    const first = announced('needs_input:t_1a9f0049:10', NOW_S - 600);
    hub.replaceCoreInterventions([first]);
    hub.applyCoreDiagnoses([[first.id, diagnosisWith('guard_hook_timeout')]]);

    // Unblocked, the card runs again, then blocks for the same cause: the core closes the first
    // intervention, opens a second, and no longer lists the first one's diagnosis.
    hub.replaceBoard(
      {
        tasks: [blocked],
        runs: [run(1, 'blocked'), { ...run(2, 'blocked'), startedAt: NOW_S - 300 }],
        links: [],
        events: [],
        comments: [],
      },
      NOW,
    );
    const second = announced('needs_input:t_1a9f0049:11', NOW_S - 100);
    hub.closeCoreIntervention(first.id);
    hub.openCoreIntervention(second);
    hub.applyCoreDiagnoses([[second.id, diagnosisWith('guard_hook_timeout')]]);

    const resolved = hub.snapshot().interventions.find((item) => item.id === first.id);
    expect(resolved?.resolvedAt).not.toBeNull();
    expect(resolved?.followUp).toEqual({ runId: 2, outcome: 'blocked', sameCause: true });
  });
});
