import { readFileSync } from 'node:fs';
import { msg } from '@factory-live/contracts';
import { serve } from '@hono/node-server';
import { GitHubAppAuth } from './adapters/github/app.ts';
import { GitHubCache } from './adapters/github/cache.ts';
import { GitHubClient } from './adapters/github/client.ts';
import { AgentLogReader } from './adapters/hermes/agentLog.ts';
import { CardFiles } from './adapters/hermes/files.ts';
import { KanbanReader } from './adapters/hermes/kanban.ts';
import { HermesPaths } from './adapters/hermes/paths.ts';
import { TwinBench } from './adapters/twins/bench.ts';
import { WorkflowApi } from './adapters/workflows/api.ts';
import { publishedSheet } from './adapters/workflows/sheets.ts';
import { ProfileConfigReader } from './adapters/hermes/profiles.ts';
import { SessionReader } from './adapters/hermes/sessions.ts';
import { PushNotifier, vapidKeys } from './adapters/push/webpush.ts';
import { HistoryStore } from './adapters/store/history.ts';
import { loadConfig } from './config.ts';
import { createApp } from './http/app.ts';
import { StreamBuffer } from './http/stream.ts';
import { DiagnosisService } from './application/diagnosis.ts';
import { Hub } from './application/hub.ts';
import { KanbanWatch } from './application/kanban-watch.ts';
import { createLogger } from './logger.ts';
import { factoryBadge, notifyOpened } from './application/notify.ts';
import { notifyArrivals, waitingForOwner } from './application/notifications.ts';
import { KEEP_FINISHED_MS } from './application/projection.ts';
import { trackUnblockReactions } from './application/unblock.ts';

/** Racine de composition : configuration, adaptateurs, hub, minuteries, serveur HTTP. */
const config = loadConfig();
const log = createLogger(config.LOG_LEVEL);
const version = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;
const now = () => Date.now();

const store = (() => {
  try {
    return new HistoryStore(config.DATA_DIR);
  } catch (error) {
    log.fatal(
      { component: 'server', dataDir: config.DATA_DIR, error: String(error) },
      'Base de factory-live impossible à ouvrir : DATA_DIR doit être un volume inscriptible (docker/compose.yaml)',
    );
    process.exit(1);
  }
})();
// Les seuls fichiers d'Hermès lus pour le diagnostic : config, journal, plugins actifs, preuves.
const paths = new HermesPaths({
  profilesDir: config.profilesDir,
  boardDir: config.boardDir,
  factoryRepo: config.FACTORY_REPO,
});
const profiles = new ProfileConfigReader(config.HERMES_HOME, config.FACTORY_REPO, paths);
const sessions = new SessionReader(config.profilesDir);
const files = new CardFiles(config.boardDir, config.CLAUDE_PROJECTS, paths);
// Une ligne du journal sans session prend la seule session ouverte de l'agent à ce moment.
const agentLog = new AgentLogReader(paths, config.HERMES_TZ, (profile, at) =>
  sessions.sessionsActiveAt(profile, at),
);
// GitHub : App factory-live (lectures, quota propre) et connexion de Clément (déblocage) ; le jeton
// fine-grained de ~/.config/factory-live/github-token sert de repli tant que l'App n'existe pas.
const githubAuth = new GitHubAppAuth({
  store,
  owner: config.GITHUB_OWNER,
  login: config.GITHUB_LOGIN,
  origins: config.PUBLIC_ORIGINS,
  fallbackToken: config.secrets.githubToken,
  api: config.GITHUB_API,
});
const githubClient = new GitHubClient(githubAuth, config.GITHUB_OWNER, config.GITHUB_API);
const github = new GitHubCache(
  githubClient,
  config.GITHUB_OWNER,
  log.child({ component: 'github' }),
  () => {
    const access = githubAuth.status();
    if (access.mode !== 'app') return msg('health.github.token');
    const slug = access.app?.slug ?? '';
    if (access.user) return msg('health.github.app.user', { slug, login: access.user.login });
    return githubAuth.canWrite()
      ? msg('health.github.app.fallback', { slug })
      : msg('health.github.app.loginNeeded', { slug });
  },
);

const diagnoses = new DiagnosisService({
  sessions,
  profiles,
  files,
  agentLog,
  pullRequests: github,
  log: log.child({ component: 'diagnosis' }),
  boardName: config.HERMES_BOARD,
});

// The workflows followed by their generic API (#31, ADR 0014), and the code line's published sheet.
const workflows = config.WORKFLOWS.map(
  (workflow) => new WorkflowApi({ name: workflow.name, url: workflow.url }),
);
let codeSheet = publishedSheet(paths.factorySheet());
/** The workflows' items that wait for the owner: the app's badge counts them with the factory's. */
const workflowsWaiting = () =>
  workflows.reduce((count, workflow) => count + waitingForOwner(workflow.view()).length, 0);

const hub = new Hub(
  {
    owner: config.GITHUB_OWNER,
    boardName: config.HERMES_BOARD,
    dashboardUrl: config.DASHBOARD_URL,
    addresses: config.addresses,
    heldAfterSeconds: config.HELD_AFTER_MINUTES * 60,
    keepFinishedMs: KEEP_FINISHED_MS,
  },
  {
    store,
    profiles,
    github,
    diagnoses,
    log: log.child({ component: 'hub' }),
    now,
    workflows: () => workflows.map((workflow) => workflow.view()),
    codeSheet: () => codeSheet,
  },
);
const buffer = new StreamBuffer();
hub.subscribe((event) => buffer.push(event));

const notifier = new PushNotifier(store, vapidKeys(store), config.VAPID_SUBJECT);
hub.interventionListeners.add((opened, all) => {
  notifyOpened({ store, notifier, log, now }, opened, all, workflowsWaiting()).catch(
    (error: unknown) =>
      log.error({ component: 'push', error: String(error) }, 'notification en échec'),
  );
});

// Kanban : data_version toutes les 300 ms, comme le dashboard d'Hermès ; réouverture si la base disparaît.
// A long outage turns /healthz to 503, then stops the process for Docker to restart it (#50).
let kanban: KanbanReader | null = null;
const kanbanWatch = new KanbanWatch({
  now,
  log: log.child({ component: 'kanban', path: config.kanbanDb }),
  requestExit: (code) => shutdown('kanban', code),
});
const pollKanban = () => {
  try {
    kanban ??= new KanbanReader(config.kanbanDb);
    if (kanban.changed()) hub.applyKanban(kanban.read(), now());
    kanbanWatch.read(now());
  } catch (error) {
    hub.kanbanFailed(String(error instanceof Error ? error.message : error));
    kanbanWatch.failed(String(error), now());
    kanban?.close();
    kanban = null;
  }
};
pollKanban();

const unblockDeps = {
  hub,
  store,
  github: githubClient,
  canWrite: () => githubAuth.canWrite(),
  factoryBot: config.FACTORY_BOT_LOGIN,
  log,
  now,
};
let githubBusy = false;
let lastDeliveries = 0;
const refreshGitHub = async () => {
  if (githubBusy) return;
  githubBusy = true;
  try {
    if (await github.refresh(hub.trackedIssues(), now())) hub.githubChanged();
    await trackUnblockReactions(unblockDeps);
    if (now() - lastDeliveries > 5 * 60_000) {
      lastDeliveries = now();
      await github.refreshDeliveries(Object.keys(profiles.manifest().projects));
      hub.githubChanged();
    }
  } catch (error) {
    log.warn({ component: 'github', error: String(error) }, 'rafraîchissement GitHub en échec');
  } finally {
    githubBusy = false;
  }
};

// A workflow is read every 5 s while someone looks at it, every 30 s otherwise: a video that arrives
// at a station waiting for the owner is notified within that time.
let workflowWatchedAt = 0;
let workflowsReadAt = 0;
let workflowsBusy = false;
const refreshWorkflows = async () => {
  if (workflowsBusy || workflows.length === 0) return;
  if (now() - workflowWatchedAt > 60_000 && now() - workflowsReadAt < 30_000) return;
  workflowsBusy = true;
  workflowsReadAt = now();
  try {
    for (const workflow of workflows) {
      if (await workflow.refresh()) hub.workflowsChanged();
      const others =
        factoryBadge(hub.openInterventions) +
        workflowsWaiting() -
        waitingForOwner(workflow.view()).length;
      await notifyArrivals({ store, notifier, log, now }, workflow.view(), others);
    }
  } catch (error) {
    log.warn({ component: 'workflows', error: String(error) }, 'lecture des workflows en échec');
  } finally {
    workflowsBusy = false;
  }
};
const refreshCodeSheet = () => {
  const next = publishedSheet(paths.factorySheet());
  if (JSON.stringify(next) !== JSON.stringify(codeSheet)) {
    codeSheet = next;
    hub.workflowsChanged();
  }
};

const timers = [
  setInterval(() => void refreshWorkflows(), 5_000),
  setInterval(refreshCodeSheet, 60_000),
  setInterval(pollKanban, 300),
  setInterval(() => hub.flush(), 250),
  setInterval(() => hub.tick(), 15_000),
  // Une config ou un plugin corrigé se voit en direct : seules les empreintes des fichiers sont relues.
  setInterval(() => hub.refreshDiagnoses(), 2_000),
  setInterval(() => hub.reloadConfig(), 5 * 60_000),
  setInterval(() => void refreshGitHub(), 30_000),
  setInterval(() => store.purgeActivity(now() - 30 * 86_400_000), 6 * 3600_000),
];
void refreshGitHub();
void refreshWorkflows();

// The factory's twin bench (#23, ADR 0013): the pair's state on the board, its ports on this PC.
const twins = new TwinBench({
  file: (repo, pr) => paths.twins(repo, pr),
  host: config.TWINS_HOST,
});
const app = createApp({
  hub,
  buffer,
  store,
  views: {
    hub,
    store,
    sessions,
    profiles,
    github,
    files,
    twins,
    agentLog,
    owner: config.GITHUB_OWNER,
    boardName: config.HERMES_BOARD,
    dashboardUrl: config.DASHBOARD_URL,
    heldAfterSeconds: config.HELD_AFTER_MINUTES * 60,
    now,
  },
  unblock: unblockDeps,
  notifier,
  githubAuth,
  twins,
  workflows,
  codeSheet: () => codeSheet,
  workflowWatched: () => {
    workflowWatchedAt = now();
  },
  kanbanHealthy: () => kanbanWatch.healthy(),
  hookSecret: config.secrets.hookSecret,
  origins: config.PUBLIC_ORIGINS,
  allowedHosts: config.allowedHosts,
  tailscaleLogins: config.TAILSCALE_LOGINS,
  webDist: config.WEB_DIST,
  log,
  now,
  version,
});

const server = serve({ fetch: app.fetch, port: config.PORT, hostname: config.HOST }, (info) => {
  log.info(
    {
      component: 'server',
      port: info.port,
      host: config.HOST,
      kanban: config.kanbanDb,
      github: githubAuth.status().mode,
      ingestion: config.secrets.hookSecret ? 'secret présent' : 'désactivée (secret absent)',
      tailscaleLogins: config.TAILSCALE_LOGINS,
      allowedHosts: config.allowedHosts,
    },
    'factory-live démarré',
  );
});

/** Stops the timers and the server, closes the databases, then exits with `code`; only once. */
let shuttingDown = false;
function shutdown(reason: string, code: number): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log.debug({ component: 'server', reason, code }, 'nettoyage avant arrêt');
  for (const timer of timers) clearInterval(timer);
  server.close(() => {
    kanban?.close();
    sessions.close();
    store.close();
    process.exit(code);
  });
  setTimeout(() => process.exit(code), 5_000).unref();
}

const stop = (signal: string) => {
  log.info({ component: 'server', signal }, 'arrêt demandé');
  shutdown(signal, 0);
};
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
