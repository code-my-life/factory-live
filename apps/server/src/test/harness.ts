import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
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
import { createLogger } from '../logger.ts';
import { insertEvent, insertRun, insertTask, kanbanDb, tempDir } from './hermes-fixtures.ts';
import type { TempDir } from './hermes-fixtures.ts';

export const SECRET = 'secret-de-test';
export const NOW = Date.parse('2026-10-28T18:00:00Z');
export const NOW_S = Math.floor(NOW / 1000);

export interface Harness {
  dir: TempDir;
  writer: DatabaseSync;
  kanban: KanbanReader;
  store: HistoryStore;
  hub: Hub;
  buffer: StreamBuffer;
  app: ReturnType<typeof createApp>;
  github: {
    calls: { method: string; url: string; body: unknown }[];
    reactions: { content: string; user: { login: string } }[];
  };
  pushes: { subscription: StoredSubscription; payload: string }[];
  clock: { now: number };
  syncKanban(): void;
  close(): void;
}

/**
 * Une factory miniature au schéma réel d'Hermès : l'issue cv-site#49, brief terminé, impl bloquée sur
 * une décision (needs_input). GitHub et Web Push sont simulés.
 */
export function harness(): Harness {
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
    return Promise.resolve(new Response('{}', { status: 404 }));
  }) as typeof fetch;
  const client = new GitHubClient('jeton', 'code-my-life', 'https://api.github.com', fakeFetch);
  const cache = new GitHubCache(client, 'code-my-life', log);
  const hub = new Hub(
    {
      owner: 'code-my-life',
      boardName: 'factory',
      dashboardUrl: 'https://desktop-gja56n4.tail40220c.ts.net:8443',
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
  const unblock = { hub, store, github: client, log, now };
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
      dashboardUrl: 'https://desktop-gja56n4.tail40220c.ts.net:8443',
      heldAfterSeconds: 1_800,
      now,
    },
    unblock,
    notifier,
    hookSecret: SECRET,
    origins: ['http://localhost:8446', 'https://desktop-gja56n4.tail40220c.ts.net:8446'],
    tailscaleLogins: ['cddev@github'],
    webDist: null,
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
