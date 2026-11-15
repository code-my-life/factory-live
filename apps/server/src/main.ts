import { readFileSync } from 'node:fs';
import { msg } from '@factory-live/contracts';
import { serve } from '@hono/node-server';
import { GitHubAppAuth } from './adapters/github/app.ts';
import { GitHubCache } from './adapters/github/cache.ts';
import { GitHubClient } from './adapters/github/client.ts';
import { TwinBench } from './adapters/twins/bench.ts';
import { WorkflowApi } from './adapters/workflows/api.ts';
import { PushNotifier, vapidKeys } from './adapters/push/webpush.ts';
import { CoreProfiles } from './adapters/workflow-core/agents.ts';
import { FactoryViews } from './adapters/workflow-core/factoryViews.ts';
import { CoreHistory } from './adapters/workflow-core/history.ts';
import { WorkflowCoreReader } from './adapters/workflow-core/reader.ts';
import { HistoryStore } from './adapters/store/history.ts';
import { loadConfig } from './config.ts';
import { createApp } from './http/app.ts';
import { StreamBuffer } from './http/stream.ts';
import { Hub } from './application/hub.ts';
import { CoreWatch } from './application/core-watch.ts';
import { createLogger } from './logger.ts';
import { factoryBadge, notifyOpened } from './application/notify.ts';
import { notifyArrivals, waitingForOwner } from './application/notifications.ts';
import { KEEP_FINISHED_MS } from './application/projection.ts';
import { trackUnblockReactions } from './application/unblock.ts';
import { CODE_WORKFLOW, declaredIn } from './application/gestures.ts';
import type { DeclaredGesture, PublishedSheet, WorkflowView } from './application/ports.ts';

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
// factory-live reads the factory from workflow-core only (#72): the agents and their configuration come from
// it (#93); nothing of the factory is opened here.
const profiles = new CoreProfiles();
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

// The workflows followed by their generic API (#31, ADR 0014), and the code line's sheet served by the core:
// none before its first answer, then the last it served (#72).
const workflows = config.WORKFLOWS.map(
  (workflow) => new WorkflowApi({ name: workflow.name, url: workflow.url }),
);
let codeSheet: PublishedSheet | null = null;
/** The workflows workflow-core declares besides the code line and the studio (#57), listed with their sheet. */
let coreWorkflows: readonly WorkflowView[] = [];
/** The gestures each workflow declares to workflow-core (#61); before the first read, none. */
let coreGestures: Record<string, DeclaredGesture[]> = {};
/** The workflows' items that wait for the owner: the app's badge counts them with the factory's. */
const workflowsWaiting = () =>
  workflows.reduce((count, workflow) => count + waitingForOwner(workflow.view()).length, 0);

const hub = new Hub(
  {
    owner: config.GITHUB_OWNER,
    boardName: CODE_WORKFLOW,
    dashboardUrl: config.DASHBOARD_URL,
    addresses: config.addresses,
    heldAfterSeconds: config.HELD_AFTER_MINUTES * 60,
    keepFinishedMs: KEEP_FINISHED_MS,
  },
  {
    store,
    profiles,
    github,
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

// The core: the full state, then its stream; without an answer, the last state stays (#57). Its
// reachability drives /healthz (#62); it never stops the process.
const coreWatch = new CoreWatch({
  now,
  log: log.child({ component: 'workflow-core' }),
});
// factory-live's own history (#63): every item read from the core; the code line keeps the items the
// factory purged.
const coreHistory = new CoreHistory(store, now);
const core = new WorkflowCoreReader({
  url: config.WORKFLOW_CORE_URL,
  secret: config.secrets.workflowCoreSecret,
  code: CODE_WORKFLOW,
  // The studio keeps its own adapter (WORKFLOWS) for its items, files and gestures until its epic.
  own: [...new Set(['studio', ...config.WORKFLOWS.map((workflow) => workflow.name)])],
  now,
  log: log.child({ component: 'workflow-core' }),
  sink: {
    board: (board, readAt, declared) =>
      hub.replaceBoard(declared ? coreHistory.withGone(CODE_WORKFLOW, board) : board, readAt),
    history: (workflow, items, complete) => coreHistory.record(workflow, items, complete),
    sheet: (next) => {
      if (JSON.stringify(next) === JSON.stringify(codeSheet)) return;
      codeSheet = next;
      hub.workflowsChanged();
    },
    // The studio's sheet comes from the core; its items still from its own adapter (#72).
    ownSheet: (name, sheet, refusal) => {
      const workflow = workflows.find((each) => each.name === name);
      if (workflow?.setSheet(sheet, refusal)) hub.workflowsChanged();
    },
    workflows: (views) => {
      coreWorkflows = views;
    },
    // The core does not answer: the screen and /healthz say so, the last state stays (#62).
    failed: (error, at) => {
      coreWatch.failed(error, at);
      hub.coreFailed(error, at);
    },
    answered: (at) => {
      coreWatch.answered(at);
      hub.coreAnswered();
    },
    machine: (machine) => hub.applyCoreMachine(machine),
    checks: (checks) => hub.applyCoreChecks(checks),
    live: (agents) => hub.replaceCoreAgents(agents),
    activity: (facts) => hub.addCoreActivity(facts),
    usage: (rows) => store.setUsage(rows),
    agents: (answer) => {
      profiles.update(answer, now());
      hub.reloadConfig();
    },
    interventions: (items) => hub.replaceCoreInterventions(items),
    interventionOpened: (item) => hub.openCoreIntervention(item),
    interventionClosed: (id) => hub.closeCoreIntervention(id),
    diagnoses: (entries) => hub.applyCoreDiagnoses(entries),
    verdicts: (cardId, verdicts) => hub.applyCoreVerdicts(cardId, verdicts),
    gestures: (declared) => {
      coreGestures = declared;
    },
  },
});
core.start();

const unblockDeps = {
  hub,
  store,
  github: githubClient,
  canWrite: () => githubAuth.canWrite(),
  factoryBot: config.FACTORY_BOT_LOGIN,
  log,
  now,
  // The gestures factory-live may post (#61): those each workflow declares to the core.
  gestures: { declared: (workflow: string) => declaredIn(coreGestures, workflow) },
  workflow: CODE_WORKFLOW,
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
const timers = [
  setInterval(() => void refreshWorkflows(), 5_000),
  setInterval(() => hub.flush(), 250),
  setInterval(() => hub.tick(), 15_000),
  // The agents are read again from the core, which reloads the hub (#93).
  setInterval(() => void core.refreshAgents(), 5 * 60_000),
  setInterval(() => void refreshGitHub(), 30_000),
  setInterval(() => store.purgeActivity(now() - 30 * 86_400_000), 6 * 3600_000),
  // Today's and yesterday's usage are read again every minute (#66).
  setInterval(() => void core.refreshUsage(2), 60_000),
  // The state of the machine is read again every 30 seconds (#62).
  setInterval(() => void core.refreshMachine(), 30_000),
];
void refreshGitHub();
void refreshWorkflows();

// The factory's twin bench (#23, ADR 0013), from the factory's declared data (#60): the twins' state and
// their mirror's port, the gate's proofs, the transcripts and the drift come from the core; a twin's session
// comes from the bench's mirror.
const factoryViews = new FactoryViews({
  url: config.WORKFLOW_CORE_URL,
  secret: config.secrets.workflowCoreSecret,
  workflow: CODE_WORKFLOW,
  log: log.child({ component: 'workflow-core' }),
});
const twins = new TwinBench({
  declared: (repo: string, pr: number) => factoryViews.pair(repo, pr),
  host: config.TWINS_HOST,
});
const app = createApp({
  hub,
  buffer,
  store,
  views: {
    hub,
    store,
    profiles,
    github,
    twins,
    owner: config.GITHUB_OWNER,
    boardName: CODE_WORKFLOW,
    dashboardUrl: config.DASHBOARD_URL,
    heldAfterSeconds: config.HELD_AFTER_MINUTES * 60,
    now,
  },
  unblock: unblockDeps,
  notifier,
  githubAuth,
  twins,
  workflows,
  coreWorkflows: () => coreWorkflows,
  generic: core,
  declared: factoryViews,
  codeSheet: () => codeSheet,
  workflowWatched: () => {
    workflowWatchedAt = now();
  },
  coreHealthy: () => coreWatch.healthy(),
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
      core: config.WORKFLOW_CORE_URL,
      github: githubAuth.status().mode,
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
    void core.stop();
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
