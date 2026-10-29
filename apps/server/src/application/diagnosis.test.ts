import { HOOK_TIMEOUT_MESSAGE, diagnose } from '@factory-live/domain';
import type {
  Board,
  Intervention,
  ProfileFacts,
  Run,
  SessionFacts,
  Task,
  TaskEvent,
} from '@factory-live/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiagnosisService, anchorOf, diagnosisView, runRefOf } from './diagnosis.ts';
import type { DiagnosisDeps } from './diagnosis.ts';

/*
 * Le service sur une réplique réduite de factory-live#2 : coder-guard lance ses contrôles dans son
 * hook, Hermès le coupe à 30 s et refuse les outils, la carte bloque. Les règles elles-mêmes sont
 * éprouvées dans le domaine sur les 13 incidents réels ; ici, le cache, l'empreinte et la conversion.
 */

const CARD = 't_665ba7d7';
const T0 = 1_793_260_612;
const NOW_MS = (T0 + 3_100) * 1000;

function task(patch: Partial<Task> = {}): Task {
  return {
    id: CARD,
    title: 'impl factory-live#2 : version du serveur',
    body: '',
    assignee: 'coder',
    status: 'blocked',
    createdAt: T0 - 600,
    startedAt: T0,
    completedAt: null,
    idempotencyKey: null,
    blockKind: 'capability',
    currentRunId: null,
    workspacePath: null,
    skills: [],
    modelOverride: null,
    providerOverride: null,
    lastHeartbeatAt: T0 + 2_900,
    branchName: 'fix/2-server-version-in-settings',
    consecutiveFailures: 0,
    blockRecurrences: 0,
    lastFailureError: null,
    maxRuntimeSeconds: null,
    ...patch,
  };
}

function run(id: number, startedAt: number, patch: Partial<Run> = {}): Run {
  return {
    id,
    taskId: CARD,
    profile: 'coder',
    status: 'done',
    outcome: 'blocked',
    startedAt,
    endedAt: startedAt + 600,
    summary: null,
    metadata: {},
    error: null,
    ...patch,
  };
}

function event(
  id: number,
  kind: string,
  createdAt: number,
  patch: Partial<TaskEvent> = {},
): TaskEvent {
  return { id, taskId: CARD, runId: null, kind, payload: {}, createdAt, ...patch };
}

const BLOCKED = event(30, 'blocked', T0 + 2_400, {
  runId: 191,
  payload: { kind: 'capability', reason: 'Je ne peux plus appeler aucun outil.' },
});

function board(patch: Partial<Board> = {}): Board {
  return {
    tasks: [task()],
    runs: [run(191, T0 + 1_800)],
    links: [],
    events: [event(1, 'created', T0 - 600), BLOCKED],
    ...patch,
  };
}

const INTERVENTION: Intervention = {
  id: `capability:${CARD}:30`,
  kind: 'capability',
  severity: 'critical',
  title: 'Je ne peux plus appeler aucun outil.',
  issueKey: 'factory-live#2',
  cardId: CARD,
  profile: 'coder',
  question: 'Je ne peux plus appeler aucun outil.',
  openedAt: T0 + 2_400,
  eventId: 30,
  push: true,
  actions: [{ kind: 'unblock' }],
};

const SESSION: SessionFacts = {
  id: '20261029_093652_fc383d',
  runId: 191,
  calls: [
    { at: T0 + 2_000, tool: 'terminal', input: 'git commit -m "feat: version"', callId: 'c1' },
    { at: T0 + 2_100, tool: 'terminal', input: 'git status', callId: 'c2' },
  ],
  results: [
    {
      at: T0 + 2_031,
      tool: 'terminal',
      callId: 'c1',
      content: `{"error": "${HOOK_TIMEOUT_MESSAGE}"}`,
    },
    {
      at: T0 + 2_101,
      tool: 'terminal',
      callId: 'c2',
      content: `{"error": "${HOOK_TIMEOUT_MESSAGE}"}`,
    },
  ],
};

const CODER: ProfileFacts = {
  profile: 'coder',
  hookTimeout: null,
  toolDeadline: null,
  terminalTimeout: 900,
  maxTurns: 400,
  changedAt: T0 - 86_400,
  repoHookTimeout: null,
  plugins: ['coder-guard'],
  hooks: [
    {
      plugin: 'coder-guard',
      hook: 'pre_tool_call',
      callback: 'pre_tool',
      source: 'ctx.register_hook("pre_tool_call", pre_tool)',
    },
  ],
};

let profile: ProfileFacts;
let stamp: string;
let deps: DiagnosisDeps & { sessions: { runFacts: ReturnType<typeof vi.fn> } };
let service: DiagnosisService;

beforeEach(() => {
  profile = CODER;
  stamp = 'config-1';
  deps = {
    sessions: { runFacts: vi.fn(() => [SESSION]) },
    profiles: { facts: () => profile, factsStamp: () => stamp },
    files: {
      evidence: () => [{ name: '01-test-fails-on-base.txt', bytes: 15_551, at: T0 + 100 }],
      evidenceStamp: () => 'evidence-1',
    },
    agentLog: null,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    boardName: 'factory',
  };
  service = new DiagnosisService(deps);
});

describe('DiagnosisService', () => {
  it('diagnostique une intervention et la rend au format du contrat', () => {
    expect(service.of(INTERVENTION.id)).toBeNull();
    expect(service.refresh(board(), [INTERVENTION], NOW_MS)).toBe(true);
    const diagnosis = service.of(INTERVENTION.id);
    expect(diagnosis?.primary).toMatchObject({
      code: 'guard_hook_timeout',
      actor: 'you_factory',
      cause: { state: 'present' },
      subject: { plugin: 'coder-guard' },
    });
    expect(diagnosis?.unblock.when).toBe('after_fix');
    expect(diagnosis?.computedAt).toBe(new Date(NOW_MS).toISOString());
    expect(diagnosis?.work?.evidence[0]?.at).toBe(new Date((T0 + 100) * 1000).toISOString());
    expect(diagnosis?.runs.map((verdict) => verdict.runId)).toEqual([191]);
    expect(service.primaryOf(INTERVENTION.id)).toBe('guard_hook_timeout');
    expect(deps.sessions.runFacts).toHaveBeenCalledWith('coder', [
      expect.objectContaining({ id: 191, taskId: CARD }),
    ]);
  });

  it('ne recalcule pas sans changement, et bascule dès que la config de l’agent change', () => {
    service.refresh(board(), [INTERVENTION], NOW_MS);
    expect(service.refresh(board(), [INTERVENTION], NOW_MS + 1_000)).toBe(false);
    expect(deps.sessions.runFacts).toHaveBeenCalledTimes(1);

    profile = { ...CODER, hookTimeout: 600, changedAt: T0 + 3_000 };
    stamp = 'config-2';
    expect(service.refresh(board(), [INTERVENTION], NOW_MS + 2_000)).toBe(true);
    const fixed = service.of(INTERVENTION.id);
    expect(fixed?.primary.cause).toMatchObject({ state: 'fixed', verified: false });
    expect(fixed?.unblock.when).toBe('now');
  });

  it('recalcule tout de suite une carte touchée par un refus, sans attendre le créneau', () => {
    service.refresh(board(), [INTERVENTION], NOW_MS);
    service.touch(CARD);
    service.touch(CARD);
    service.refresh(board(), [INTERVENTION], NOW_MS + 1_000);
    expect(deps.sessions.runFacts).toHaveBeenCalledTimes(2);
    service.refresh(board(), [INTERVENTION], NOW_MS + 1_500);
    expect(deps.sessions.runFacts).toHaveBeenCalledTimes(2);
  });

  it('recalcule à chaque créneau, sans rien renvoyer quand seul l’instant de calcul change', () => {
    service.refresh(board(), [INTERVENTION], NOW_MS);
    const first = service.of(INTERVENTION.id);
    expect(service.refresh(board(), [INTERVENTION], NOW_MS + 16_000)).toBe(false);
    expect(deps.sessions.runFacts).toHaveBeenCalledTimes(2);
    expect(service.of(INTERVENTION.id)).toBe(first);
  });

  it('oublie le diagnostic d’une intervention disparue, et ignore ce qui ne s’explique pas', () => {
    service.refresh(board(), [INTERVENTION], NOW_MS);
    const approval: Intervention = {
      ...INTERVENTION,
      id: 'pr_approval:t_x:1',
      kind: 'pr_approval',
    };
    expect(service.refresh(board(), [approval], NOW_MS)).toBe(true);
    expect(service.of(INTERVENTION.id)).toBeNull();
    expect(service.of(approval.id)).toBeNull();
  });

  it('dit les sources illisibles plutôt que de planter', () => {
    deps.sessions.runFacts.mockImplementation(() => {
      throw new Error('database is locked');
    });
    deps.profiles.facts = () => null;
    service.refresh(board(), [INTERVENTION], NOW_MS);
    const diagnosis = service.of(INTERVENTION.id);
    expect(diagnosis?.sources).toMatchObject({ transcript: false, config: false });
    expect(diagnosis?.primary.code).not.toBe('guard_hook_timeout');
  });

  it('donne le verdict de chaque run en échec d’une carte finie, épisode par épisode', () => {
    const done = board({
      tasks: [task({ status: 'done', blockKind: null })],
      runs: [
        run(191, T0 + 1_800),
        run(192, T0 + 4_000, { outcome: 'review_requested', status: 'done' }),
      ],
      events: [
        event(1, 'created', T0 - 600),
        BLOCKED,
        event(31, 'unblocked', T0 + 3_900),
        event(32, 'review_requested', T0 + 4_500, { runId: 192 }),
      ],
    });
    const verdicts = service.verdictsOf(done, done.tasks[0] as Task, NOW_MS);
    expect([...verdicts.keys()]).toEqual([191]);
    expect(verdicts.get(191)).toMatchObject({
      finding: 'guard_hook_timeout',
      role: 'consequence',
    });
    // Même carte, mêmes faits : le cache répond.
    expect(service.verdictsOf(done, done.tasks[0] as Task, NOW_MS)).toBe(verdicts);
    expect(deps.sessions.runFacts).toHaveBeenCalledTimes(1);
  });

  it('ne cherche aucun verdict pour une carte sans échec', () => {
    const clean = board({ runs: [run(191, T0, { outcome: 'completed' })] });
    expect(service.verdictsOf(clean, clean.tasks[0] as Task, NOW_MS).size).toBe(0);
    expect(deps.sessions.runFacts).not.toHaveBeenCalled();
  });
});

describe('anchorOf', () => {
  // t_03d9d40d : deux runs de coder sortis sans appel kanban, une revue, puis trois runs de la gate
  // sortis de même, et l'abandon du disjoncteur noté sans run avant la relance.
  const runs = [180, 181, 182, 183, 184, 185, 186].map((id) => run(id, T0 + id));
  const events = [
    event(2894, 'claimed', T0, { runId: 180 }),
    event(2904, 'protocol_violation', T0, { runId: 180 }),
    event(2905, 'claimed', T0, { runId: 181 }),
    event(2974, 'protocol_violation', T0, { runId: 181 }),
    event(2975, 'claimed', T0, { runId: 182 }),
    event(2984, 'review_requested', T0, { runId: 182 }),
    event(2985, 'claimed', T0, { runId: 183 }),
    event(2989, 'protocol_violation', T0, { runId: 183 }),
    event(2998, 'protocol_violation', T0, { runId: 185 }),
    event(2999, 'gave_up', T0),
    event(3002, 'unblocked', T0),
    event(3003, 'claimed', T0, { runId: 186 }),
  ];

  it('raconte l’échec d’un run par son événement, ou par l’abandon noté juste après lui', () => {
    expect(anchorOf(events, runs, runs[1] as Run)).toBe(2974);
    expect(anchorOf(events, runs, runs[5] as Run)).toBe(2999);
    expect(anchorOf(events, runs, runs[2] as Run)).toBeNull();
  });
});

describe('runRefOf', () => {
  it('retrouve la session d’un run par Hermès ou par `hermes --resume`', () => {
    expect(
      runRefOf(
        run(189, T0, {
          metadata: {
            worker_output:
              'Resume this session with: hermes --resume 20261029_085654_8bd48a -p coder',
          },
        }),
      ),
    ).toMatchObject({ workerSessionId: null, resumeSessionId: '20261029_085654_8bd48a' });
    expect(
      runRefOf(run(192, T0, { metadata: { worker_session_id: '20261029_101049_0612ab' } })),
    ).toMatchObject({ workerSessionId: '20261029_101049_0612ab' });
  });
});

describe('diagnosisView', () => {
  it('borne les listes du contrat, date en ISO et ne garde que des nombres positifs', () => {
    const domain = diagnose({
      now: NOW_MS / 1000,
      board: 'factory',
      task: task(),
      runs: [run(191, T0 + 1_800)],
      events: [event(1, 'created', T0 - 600), BLOCKED],
      anchor: BLOCKED,
      sessions: [SESSION],
      logs: null,
      profile: CODER,
      evidence: null,
      branch: null,
      prUrl: null,
    });
    const evidence = domain.primary.evidence[0];
    if (!evidence) throw new Error('preuve attendue');
    const crowded = {
      ...domain,
      primary: {
        ...domain.primary,
        evidence: Array.from({ length: 12 }, () => ({ ...evidence, count: 0, runId: 0 })),
      },
      others: Array.from({ length: 6 }, () => domain.primary),
    };
    const view = diagnosisView(crowded);
    expect(view.primary.evidence).toHaveLength(8);
    expect(view.others).toHaveLength(4);
    expect(view.primary.evidence[0]).toMatchObject({ count: null, runId: null });
    expect(view.episode.from).toBe(new Date(domain.episode.from * 1000).toISOString());
  });
});
