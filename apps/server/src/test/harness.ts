import { join } from 'node:path';
import { GitHubAppAuth } from '../adapters/github/app.ts';
import { GitHubCache } from '../adapters/github/cache.ts';
import { GitHubClient } from '../adapters/github/client.ts';
import { PushNotifier } from '../adapters/push/webpush.ts';
import type { StoredSubscription } from '../adapters/store/history.ts';
import { HistoryStore } from '../adapters/store/history.ts';
import { CoreProfiles } from '../adapters/workflow-core/agents.ts';
import { coreInterventionState } from '../adapters/workflow-core/interventions.ts';
import { createApp } from '../http/app.ts';
import type { TwinBench } from '../adapters/twins/bench.ts';
import type { WorkflowApi } from '../adapters/workflows/api.ts';
import { StreamBuffer } from '../http/stream.ts';
import { CoreWatch } from '../application/core-watch.ts';
import { declaredIn } from '../application/gestures.ts';
import { Hub } from '../application/hub.ts';
import type { UnblockDeps } from '../application/unblock.ts';
import type {
  DeclaredGesture,
  DeclaredViewsPort,
  GesturesPort,
  GenericWorkflowsPort,
} from '../application/ports.ts';
import type { AgentsResponse, CoreIntervention } from '@factory-live/contracts/workflow-core';
import { createLogger } from '../logger.ts';
import { allowedHosts, appAddresses } from '../config.ts';
import { appPem } from './github-fixtures.ts';
import {
  coreBoard,
  insertEvent,
  insertLink,
  insertRun,
  insertTask,
  tempDir,
} from './board-fixtures.ts';
import type { CoreBoard, TempDir } from './board-fixtures.ts';

export const SECRET = 'secret-de-test';
export const NOW = Date.parse('2026-10-28T18:00:00Z');
export const NOW_S = Math.floor(NOW / 1000);
export const ORIGINS = ['http://localhost:8446', 'https://machine.tailnet.ts.net:8446'];

const LIMITS = [
  { key: 'hook_callback_timeout', value: null, default: 30, unit: 'seconds' },
  { key: 'tool_deadline', value: null, default: 420, unit: 'seconds' },
  { key: 'terminal_timeout', value: null, default: 180, unit: 'seconds' },
  { key: 'max_turns', value: null, default: null, unit: 'turns' },
];

const agent = (name: string, skill: string) => ({
  name,
  skills: [skill],
  model: { name: 'auto', provider: 'freellmapi' },
  fallbacks: [],
  effort: null,
  toolsets: [],
  plugins: [{ name: 'factory-notify', longest_seconds: null, hook_timeouts: 0 }],
  mcp: [],
  limits: LIMITS,
});

/** The harness' agents as workflow-core serves them (#93): four agents in the manifest's order, the kanban at 2 and 1. */
export const HARNESS_AGENTS = {
  kanban: { max_in_progress: 2, max_in_progress_per_profile: 1 },
  guard_risks: [],
  agents: [
    agent('coordinator', 'factory-brief'),
    agent('coder', 'factory-author-proof'),
    agent('gate', 'factory-gate'),
    agent('release', 'factory-release'),
  ],
} as unknown as AgentsResponse;

/** The intervention the core publishes for the blocked card of cv-site#49 (#59). */
export const HARNESS_INTERVENTION = {
  id: 'needs_input:t_1a9f0049:1',
  kind: 'needs_input',
  item: 't_1a9f0049',
  event: 1,
  opened_at: new Date((NOW_S - 600) * 1000).toISOString(),
  agent: 'coder',
  severity: 'critical',
  push: true,
  title: { quote: 'Quelle base de données ?' },
  question: { quote: 'Quelle base de données ?\nPostgreSQL ou SQLite ?' },
  actions: [{ kind: 'gesture', gesture: 'unblock' }],
} as unknown as CoreIntervention;

/** The gestures the code line declares to the core (#61): the unblocking, a comment on the issue. */
export const HARNESS_GESTURES: Record<string, DeclaredGesture[]> = {
  factory: [{ name: 'unblock', kind: 'comment', repo: null }],
};

export interface Harness {
  dir: TempDir;
  /** The cards the core serves; `syncBoard` gives them to the hub, as a read of the core does. */
  core: CoreBoard;
  store: HistoryStore;
  hub: Hub;
  buffer: StreamBuffer;
  app: ReturnType<typeof createApp>;
  github: {
    calls: { method: string; url: string; body: unknown; auth: string | null }[];
    reactions: { content: string; user: { login: string } }[];
  };
  githubAuth: GitHubAppAuth;
  unblock: UnblockDeps;
  pushes: { subscription: StoredSubscription; payload: string }[];
  clock: { now: number };
  /** The core's reachability behind `/healthz` (#62), on the harness clock. */
  coreWatch: CoreWatch;
  /** The core's cards read again, as the reader gives them to the hub. */
  syncBoard(): void;
  /** One pass of the GitHub cache over the tracked issues, as `main.ts` runs every 30 s. */
  refreshGitHub(): Promise<boolean>;
  close(): void;
}

/**
 * A miniature factory, as the core serves it: the issue cv-site#49, its brief done, its impl blocked on a
 * decision (needs_input), the intervention the core publishes for it, and the agents it describes. GitHub
 * (API, App and OAuth login) and Web Push are simulated; without an App, GitHub is reached with the fallback
 * token (`jeton`, or none with `githubToken: null`).
 */
export function harness(
  options: {
    githubToken?: string | null;
    streamPingMs?: number;
    /** More answers of GitHub, by the end of the address, read before the built-in ones. */
    githubRoutes?: Record<string, () => Response>;
    /** The factory's twin bench (#23). */
    twins?: TwinBench;
    /** The workflows followed by their generic API (#31). */
    workflows?: WorkflowApi[];
    /** The generic workflows workflow-core declares (#65), for their screen. */
    generic?: GenericWorkflowsPort;
    /** The factory's declared data (#60). */
    declared?: DeclaredViewsPort;
    /** The gestures each workflow declares (#61); absent: those of `HARNESS_GESTURES`. */
    gestures?: GesturesPort;
    /** The interventions the core publishes; absent: `HARNESS_INTERVENTION`. */
    interventions?: CoreIntervention[];
  } = {},
): Harness {
  const dir = tempDir();
  const core = coreBoard();
  insertTask(core, {
    id: 't_b1ef0049',
    title: 'brief cv-site#49 : Page Projets',
    status: 'done',
    assignee: 'coordinator',
    createdAt: NOW_S - 7_200,
  });
  insertTask(core, {
    id: 't_1a9f0049',
    title: 'impl cv-site#49 : Page Projets',
    status: 'blocked',
    assignee: 'coder',
    blockKind: 'needs_input',
    createdAt: NOW_S - 6_000,
  });
  insertLink(core, 't_b1ef0049', 't_1a9f0049');
  insertRun(core, {
    taskId: 't_b1ef0049',
    profile: 'coordinator',
    status: 'done',
    outcome: 'completed',
    startedAt: NOW_S - 7_100,
    endedAt: NOW_S - 6_100,
  });
  insertRun(core, {
    taskId: 't_1a9f0049',
    profile: 'coder',
    status: 'done',
    outcome: 'blocked',
    startedAt: NOW_S - 5_000,
    endedAt: NOW_S - 600,
  });
  insertEvent(core, {
    taskId: 't_1a9f0049',
    kind: 'blocked',
    runId: 2,
    payload: { kind: 'needs_input', reason: 'Quelle base de données ?\nPostgreSQL ou SQLite ?' },
    createdAt: NOW_S - 600,
  });

  const clock = { now: NOW };
  const now = () => clock.now;
  const log = createLogger('silent');
  const store = new HistoryStore(join(dir.path, 'data'));
  const profiles = new CoreProfiles();
  profiles.update(HARNESS_AGENTS, NOW);
  const github: Harness['github'] = { calls: [], reactions: [] };
  const fakeFetch = ((input: string | URL | Request, init: RequestInit = {}) => {
    const url = input instanceof Request ? input.url : input.toString();
    const method = init.method ?? 'GET';
    github.calls.push({
      method,
      url,
      body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : null,
      auth: new Headers(init.headers).get('authorization'),
    });
    const respond = (body: unknown) =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    const extra = Object.keys(options.githubRoutes ?? {}).find((route) => url.endsWith(route));
    if (extra) return Promise.resolve(options.githubRoutes![extra]!());
    if (method === 'POST' && url.endsWith('/issues/49/comments'))
      return respond({
        id: 4242,
        html_url: 'https://github.com/code-my-life/cv-site/issues/49#issuecomment-4242',
      });
    if (url.includes('/reactions')) return respond(github.reactions);
    if (url.endsWith('/issues/49'))
      return respond({
        title: 'Page Projets',
        html_url: 'https://github.com/code-my-life/cv-site/issues/49',
        labels: [{ name: 'factory', color: 'a2eeef' }],
        state: 'open',
      });
    if (method === 'POST' && url.includes('/app-manifests/'))
      return respond({
        id: 123,
        slug: 'factory-live-test',
        client_id: 'Iv23litest',
        client_secret: 'secret-app',
        pem: appPem(),
        html_url: 'https://github.com/apps/factory-live-test',
      });
    if (method === 'POST' && url === 'https://github.com/login/oauth/access_token')
      return respond({
        access_token: 'ghu_test',
        expires_in: 28_800,
        refresh_token: 'ghr_test',
        refresh_token_expires_in: 15_897_600,
      });
    if (url === 'https://api.github.com/user')
      return respond({
        login: 'cddev',
        id: 42,
        avatar_url: 'https://avatars.githubusercontent.com/u/42',
      });
    if (url.endsWith('/orgs/code-my-life/installation')) return respond({ id: 99 });
    if (method === 'POST' && url.endsWith('/app/installations/99/access_tokens'))
      return respond({
        token: 'ghs_test',
        expires_at: new Date(clock.now + 3_600_000).toISOString(),
      });
    return Promise.resolve(new Response('{}', { status: 404 }));
  }) as typeof fetch;
  const githubAuth = new GitHubAppAuth({
    store,
    owner: 'code-my-life',
    login: 'cddev',
    origins: ORIGINS,
    fallbackToken: options.githubToken === undefined ? 'jeton' : options.githubToken,
    fetchImpl: fakeFetch,
    now,
  });
  const client = new GitHubClient(githubAuth, 'code-my-life', 'https://api.github.com', fakeFetch);
  const cache = new GitHubCache(client, 'code-my-life', log);
  const hub = new Hub(
    {
      owner: 'code-my-life',
      boardName: 'factory',
      dashboardUrl: 'https://machine.tailnet.ts.net:9443',
      addresses: appAddresses(ORIGINS, 8446),
      heldAfterSeconds: 1_800,
      keepFinishedMs: 86_400_000,
    },
    { store, profiles, github: cache, log, now },
  );
  const buffer = new StreamBuffer();
  hub.subscribe((event) => buffer.push(event));
  const syncBoard = () => hub.replaceBoard(core.board(), clock.now);
  syncBoard();
  const gestures = options.gestures ?? {
    declared: (workflow: string) => declaredIn(HARNESS_GESTURES, workflow),
  };
  const declared = new Set(
    (gestures.declared('factory') ?? [])
      .filter((gesture) => gesture.kind === 'comment')
      .map((gesture) => gesture.name),
  );
  hub.replaceCoreInterventions(
    (options.interventions ?? [HARNESS_INTERVENTION]).map((item) =>
      coreInterventionState(item, declared),
    ),
  );
  const coreWatch = new CoreWatch({ now, log });
  const pushes: Harness['pushes'] = [];
  const notifier = new PushNotifier(
    store,
    { publicKey: 'BPUBLIC', privateKey: 'private' },
    'https://github.com/code-my-life/factory-live',
    (subscription, payload) => {
      pushes.push({ subscription, payload });
      return Promise.resolve();
    },
  );
  const unblock: UnblockDeps = {
    hub,
    store,
    github: client,
    canWrite: () => githubAuth.canWrite(),
    factoryBot: 'code-my-life-factory[bot]',
    log,
    now,
    gestures,
  };
  const app = createApp({
    hub,
    buffer,
    store,
    views: {
      hub,
      store,
      profiles,
      github: cache,
      owner: 'code-my-life',
      boardName: 'factory',
      dashboardUrl: 'https://machine.tailnet.ts.net:9443',
      heldAfterSeconds: 1_800,
      now,
    },
    unblock,
    notifier,
    githubAuth,
    ...(options.twins ? { twins: options.twins } : {}),
    ...(options.workflows ? { workflows: options.workflows } : {}),
    ...(options.generic ? { generic: options.generic } : {}),
    ...(options.declared ? { declared: options.declared } : {}),
    coreHealthy: () => coreWatch.healthy(),
    origins: ORIGINS,
    allowedHosts: allowedHosts(8446, ORIGINS),
    tailscaleLogins: ['alice@github'],
    webDist: null,
    ...(options.streamPingMs ? { streamPingMs: options.streamPingMs } : {}),
    log,
    now,
    version: 'test',
  });
  return {
    dir,
    core,
    store,
    hub,
    buffer,
    app,
    github,
    githubAuth,
    unblock,
    pushes,
    clock,
    coreWatch,
    syncBoard,
    refreshGitHub: () => cache.refresh(hub.trackedIssues(), clock.now),
    close: () => {
      store.close();
      dir.remove();
    },
  };
}
