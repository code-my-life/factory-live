import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { GitHubAppAuth } from '../adapters/github/app.ts';
import { GitHubCache } from '../adapters/github/cache.ts';
import { GitHubClient } from '../adapters/github/client.ts';
import { CardFiles } from '../adapters/hermes/files.ts';
import { KanbanReader } from '../adapters/hermes/kanban.ts';
import { ProfileConfigReader } from '../adapters/hermes/profiles.ts';
import { SessionReader } from '../adapters/hermes/sessions.ts';
import { PushNotifier } from '../adapters/push/webpush.ts';
import type { StoredSubscription } from '../adapters/store/history.ts';
import { HistoryStore } from '../adapters/store/history.ts';
import { createApp } from '../http/app.ts';
import { StreamBuffer } from '../http/stream.ts';
import { Hub } from '../application/hub.ts';
import type { UnblockDeps } from '../application/unblock.ts';
import { createLogger } from '../logger.ts';
import { allowedHosts, appAddresses } from '../config.ts';
import { appPem } from './github-fixtures.ts';
import { insertEvent, insertRun, insertTask, kanbanDb, tempDir } from './hermes-fixtures.ts';
import type { TempDir } from './hermes-fixtures.ts';

export const SECRET = 'secret-de-test';
export const NOW = Date.parse('2026-10-28T18:00:00Z');
export const NOW_S = Math.floor(NOW / 1000);
export const ORIGINS = ['http://localhost:8446', 'https://machine.tailnet.ts.net:8446'];

export interface Harness {
  dir: TempDir;
  writer: DatabaseSync;
  kanban: KanbanReader;
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
  syncKanban(): void;
  close(): void;
}

/**
 * Une factory miniature au schéma réel d'Hermès : l'issue cv-site#49, brief terminé, impl bloquée sur
 * une décision (needs_input). GitHub (API, App et connexion OAuth) et Web Push sont simulés ; sans App
 * créée, l'accès GitHub passe par le jeton de repli (`jeton`, ou aucun avec `githubToken: null`).
 */
export function harness(
  options: { githubToken?: string | null; streamPingMs?: number } = {},
): Harness {
  const dir = tempDir();
  const hermes = join(dir.path, 'hermes');
  const factory = join(dir.path, 'factory');
  const boardDir = join(hermes, 'kanban', 'boards', 'factory');
  mkdirSync(boardDir, { recursive: true });
  for (const profile of ['coordinator', 'coder', 'gate', 'release']) {
    mkdirSync(join(hermes, 'profiles', profile), { recursive: true });
    mkdirSync(join(factory, 'profiles', profile), { recursive: true });
    const config = `model:\n  default: auto\n  provider: freellmapi\nplugins:\n  enabled: [factory-notify]\n`;
    writeFileSync(join(hermes, 'profiles', profile, 'config.yaml'), config);
    writeFileSync(
      join(factory, 'profiles', profile, 'config.yaml'),
      profile === 'coder' ? config.replace('auto', 'agnes-2.5-flash') : config,
    );
  }
  writeFileSync(
    join(hermes, 'config.yaml'),
    'kanban:\n  max_in_progress: 2\n  max_in_progress_per_profile: 1\n',
  );
  writeFileSync(
    join(factory, 'factory.yaml'),
    'github_user: cddev\nprojects:\n  cv-site: {repo: code-my-life/cv-site}\nprofiles:\n  coordinator: {skills: [factory-brief], plugins: [factory-notify]}\n  coder: {skills: [factory-author-proof], plugins: [coder-guard]}\n  gate: {skills: [factory-gate], plugins: [gate-readonly]}\n  release: {skills: [factory-release], plugins: [merge-guard]}\n',
  );

  const writer = kanbanDb(join(boardDir, 'kanban.db'));
  insertTask(writer, {
    id: 't_b1ef0049',
    title: 'brief cv-site#49 : Page Projets',
    status: 'done',
    assignee: 'coordinator',
    createdAt: NOW_S - 7_200,
  });
  insertTask(writer, {
    id: 't_1a9f0049',
    title: 'impl cv-site#49 : Page Projets',
    status: 'blocked',
    assignee: 'coder',
    blockKind: 'needs_input',
    createdAt: NOW_S - 6_000,
  });
  writer
    .prepare("INSERT INTO task_links (parent_id, child_id) VALUES ('t_b1ef0049', 't_1a9f0049')")
    .run();
  insertRun(writer, {
    taskId: 't_b1ef0049',
    profile: 'coordinator',
    status: 'done',
    outcome: 'completed',
    startedAt: NOW_S - 7_100,
    endedAt: NOW_S - 6_100,
  });
  insertRun(writer, {
    taskId: 't_1a9f0049',
    profile: 'coder',
    status: 'done',
    outcome: 'blocked',
    startedAt: NOW_S - 5_000,
    endedAt: NOW_S - 600,
  });
  insertEvent(writer, {
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
  const profiles = new ProfileConfigReader(hermes, factory);
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
        labels: [{ name: 'factory' }],
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
  const kanban = new KanbanReader(join(boardDir, 'kanban.db'));
  const syncKanban = () => {
    if (kanban.changed()) hub.applyKanban(kanban.read(), clock.now);
  };
  syncKanban();
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
    log,
    now,
  };
  const app = createApp({
    hub,
    buffer,
    store,
    views: {
      hub,
      store,
      sessions: new SessionReader(join(hermes, 'profiles')),
      profiles,
      github: cache,
      files: new CardFiles(boardDir, join(dir.path, 'claude-projects')),
      owner: 'code-my-life',
      boardName: 'factory',
      dashboardUrl: 'https://machine.tailnet.ts.net:9443',
      heldAfterSeconds: 1_800,
      now,
    },
    unblock,
    notifier,
    githubAuth,
    hookSecret: SECRET,
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
    writer,
    kanban,
    store,
    hub,
    buffer,
    app,
    github,
    githubAuth,
    unblock,
    pushes,
    clock,
    syncKanban,
    close: () => {
      kanban.close();
      writer.close();
      store.close();
      dir.remove();
    },
  };
}
