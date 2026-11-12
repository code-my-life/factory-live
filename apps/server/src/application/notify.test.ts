import { msg } from '@factory-live/contracts';
import type { Diagnosis, FindingCode, Intervention } from '@factory-live/contracts';
import { describe, expect, it, vi } from 'vitest';
import { Hub } from './hub.ts';
import { notifyOpened } from './notify.ts';
import type { NotifyDeps } from './notify.ts';
import type {
  CoreInterventionState,
  HistoryPort,
  LoggerPort,
  ProfilesPort,
  PushMessage,
  PushPort,
} from './ports.ts';
import { KEEP_FINISHED_MS } from './projection.ts';

const NOW = Date.parse('2026-10-28T18:00:00Z');

function intervention(patch: Partial<Intervention> = {}): Intervention {
  return {
    id: 'needs_input:t_1:10',
    kind: 'needs_input',
    severity: 'critical',
    title: 'Quelle base de données ?',
    issueKey: 'cv-site#49',
    cardId: 't_1',
    profile: 'coordinator',
    question: 'Quelle base de données ?\nPostgreSQL ou SQLite ?',
    openedAt: new Date(NOW - 60_000).toISOString(),
    push: true,
    actions: [{ kind: 'unblock' }],
    unblock: null,
    diagnosis: null,
    resolvedAt: null,
    followUp: null,
    ...patch,
  };
}

/** Le diagnostic de factory-live#2 réduit à ce que la notification lit : la cause principale. */
function diagnosis(code: FindingCode): Diagnosis {
  return {
    computedAt: new Date(NOW).toISOString(),
    episode: { from: new Date(NOW - 3_600_000).toISOString(), runIds: [191] },
    primary: {
      code,
      confidence: 'certain',
      actor: 'you_factory',
      cause: { state: 'present' },
      summary: msg('diagnosis.summary.guardHookTimeout', { plugin: 'coder-guard', seconds: 30 }),
      why: msg('diagnosis.why.guardHookTimeout', {
        plugin: 'coder-guard',
        trigger: 'git commit',
        seconds: 30,
      }),
      subject: { profile: 'coder', plugin: 'coder-guard', tool: null },
      setting: null,
      evidence: [],
      steps: [],
      runIds: [191],
    },
    others: [],
    unblock: { when: 'after_fix', template: null, nextBlock: 'triage' },
    runs: [],
    work: null,
    sources: { transcript: true, agentLog: true, config: true, workspace: true },
  };
}

function deps() {
  const sent: PushMessage[] = [];
  const claimed = new Set<string>();
  const value = {
    store: {
      claimNotification: (id: string) => (claimed.has(id) ? false : (claimed.add(id), true)),
    },
    notifier: {
      notify: vi.fn((message: PushMessage) => {
        sent.push(message);
        return Promise.resolve({ sent: 1, removed: 0, failed: 0 });
      }),
    },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    now: () => NOW,
  } as unknown as NotifyDeps;
  return { value, sent };
}

describe('notifyOpened', () => {
  it('envoie l’issue à part et le texte tel qu’il est : le service worker l’écrit dans sa langue', async () => {
    const { value, sent } = deps();
    const fallback = intervention({
      id: 'capability:t_2:11',
      title: msg('intervention.title.capability'),
      question: msg('intervention.question.capability'),
    });
    await notifyOpened(value, [intervention(), fallback], [intervention(), fallback]);
    expect(sent).toEqual([
      {
        where: 'cv-site#49',
        title: 'Quelle base de données ?',
        body: 'Quelle base de données ? PostgreSQL ou SQLite ?',
        url: '/interventions/needs_input%3At_1%3A10',
        tag: 'needs_input:t_1:10',
        badge: 2,
      },
      {
        where: 'cv-site#49',
        title: msg('intervention.title.capability'),
        body: msg('intervention.question.capability'),
        url: '/interventions/capability%3At_2%3A11',
        tag: 'capability:t_2:11',
        badge: 2,
      },
    ]);
  });

  it('coupe un texte d’agent trop long, une seule notification par intervention', async () => {
    const { value, sent } = deps();
    const long = intervention({ title: 'x'.repeat(200), question: 'y'.repeat(400) });
    await notifyOpened(value, [long], [long]);
    await notifyOpened(value, [long], [long]);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.title).toHaveLength(90);
    expect(sent[0]?.body).toHaveLength(180);
  });

  it('ne notifie ni ce qui n’attend pas Clément, ni ce qui est trop ancien', async () => {
    const { value, sent } = deps();
    await notifyOpened(
      value,
      [
        intervention({ id: 'pr_approval:t_3:1', kind: 'pr_approval', push: false }),
        intervention({ id: 'old', openedAt: new Date(NOW - 7 * 3_600_000).toISOString() }),
      ],
      [],
    );
    expect(sent).toEqual([]);
  });

  it('dit la cause trouvée par le diagnostic, et la question de l’agent quand c’en est une', async () => {
    const { value, sent } = deps();
    const hook = intervention({
      id: 'capability:t_9:30',
      diagnosis: diagnosis('guard_hook_timeout'),
    });
    const question = intervention({ id: 'needs_input:t_8:31', diagnosis: diagnosis('question') });
    const resolved = intervention({ id: 'r', resolvedAt: new Date(NOW).toISOString() });
    await notifyOpened(value, [hook, question], [hook, question, resolved]);
    expect(sent.map((message) => [message.title, message.body, message.badge])).toEqual([
      [hook.diagnosis?.primary.summary, hook.diagnosis?.primary.why, 2],
      ['Quelle base de données ?', 'Quelle base de données ? PostgreSQL ou SQLite ?', 2],
    ]);
  });
});

// --- Interventions announced by workflow-core (#59) -------------------------------------------------------

/** A store that keeps the notifications claimed, shared between two hubs as one base across a restart. */
function coreStore(claimed: Set<string>): HistoryPort {
  const store: Partial<HistoryPort> = {
    board: () => ({ tasks: [], runs: [], links: [], events: [], comments: [] }),
    stations: () => new Map(),
    recentActivity: () => [],
    saveStation: () => {},
    appendActivity: () => {},
    openUnblocks: () => [],
    unblock: () => null,
    claimNotification: (id: string) => (claimed.has(id) ? false : (claimed.add(id), true)),
  };
  return store as HistoryPort;
}

/** A hub on workflow-core's side whose openings go to `notifyOpened`, as main.ts wires it. */
function coreHub(claimed: Set<string>, sent: PushMessage[]): Hub {
  const silent: LoggerPort = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  const store = coreStore(claimed);
  const profiles: ProfilesPort = {
    profiles: () => [],
    live: () => null,
    repo: () => null,
    manifest: () => ({ owner: null, projects: {}, profiles: {} }),
    root: () => ({ maxInProgress: 0, maxInProgressPerProfile: 0 }),
    facts: () => null,
    factsStamp: () => '',
  };
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
  const notifier: PushPort = {
    notify: (message) => {
      sent.push(message);
      return Promise.resolve({ sent: 1, removed: 0, failed: 0 });
    },
  };
  hub.interventionListeners.add((opened, all) => {
    void notifyOpened({ store, notifier, log: silent, now: () => NOW }, opened, all);
  });
  return hub;
}

/** An intervention as the adapter of the core hands it to the hub (seconds epoch, factory-live texts). */
function announced(patch: Partial<CoreInterventionState> = {}): CoreInterventionState {
  return {
    id: 'needs_input:t_1:10',
    kind: 'needs_input',
    cardId: 't_1',
    eventId: 10,
    openedAt: Math.floor((NOW - 60_000) / 1000),
    profile: 'coder',
    severity: 'critical',
    push: true,
    title: 'Quelle base de données ?',
    question: 'Quelle base de données ?\nPostgreSQL ou SQLite ?',
    actions: [{ kind: 'unblock' }],
    ...patch,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('notifications des interventions annoncées par le socle (#59)', () => {
  it('une ouverture annoncée par le socle envoie une seule notification', async () => {
    const sent: PushMessage[] = [];
    const hub = coreHub(new Set(), sent);
    hub.flush();

    hub.openCoreIntervention(announced());
    hub.flush();
    await settle();
    // Announced again (a full read after a reset), it is not sent twice.
    hub.replaceCoreInterventions([announced()]);
    hub.flush();
    await settle();

    expect(sent).toEqual([
      {
        where: 't_1',
        title: 'Quelle base de données ?',
        body: 'Quelle base de données ? PostgreSQL ou SQLite ?',
        url: '/interventions/needs_input%3At_1%3A10',
        tag: 'needs_input:t_1:10',
        badge: 1,
      },
    ]);
  });

  it('après un redémarrage, rien n’est renvoyé et une ouverture manquée est notifiée une fois', async () => {
    const claimed = new Set<string>();
    const before: PushMessage[] = [];
    const first = coreHub(claimed, before);
    first.openCoreIntervention(announced());
    first.flush();
    await settle();
    expect(before).toHaveLength(1);

    // factory-live restarts on the same base; while it was down, three interventions opened.
    const missed = announced({ id: 'capability:t_2:11', cardId: 't_2', kind: 'capability' });
    const old = announced({
      id: 'capability:t_3:12',
      cardId: 't_3',
      kind: 'capability',
      openedAt: Math.floor((NOW - 7 * 3600_000) / 1000),
    });
    const silentOne = announced({ id: 'needs_input:t_4:13', cardId: 't_4', push: false });
    const after: PushMessage[] = [];
    const second = coreHub(claimed, after);
    second.replaceCoreInterventions([announced(), missed, old, silentOne]);
    second.flush();
    await settle();
    second.flush();
    await settle();

    expect(after.map((message) => message.tag)).toEqual(['capability:t_2:11']);
  });
});
