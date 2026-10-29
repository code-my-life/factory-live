import { readFileSync } from 'node:fs';
import { msg } from '@factory-live/contracts';
import { serve } from '@hono/node-server';
import { GitHubAppAuth } from './adapters/github/app.ts';
import { GitHubCache } from './adapters/github/cache.ts';
import { GitHubClient } from './adapters/github/client.ts';
import { CardFiles } from './adapters/hermes/files.ts';
import { KanbanReader } from './adapters/hermes/kanban.ts';
import { ProfileConfigReader } from './adapters/hermes/profiles.ts';
import { SessionReader } from './adapters/hermes/sessions.ts';
import { PushNotifier, vapidKeys } from './adapters/push/webpush.ts';
import { HistoryStore } from './adapters/store/history.ts';
import { loadConfig } from './config.ts';
import { createApp } from './http/app.ts';
import { StreamBuffer } from './http/stream.ts';
import { Hub } from './application/hub.ts';
import { createLogger } from './logger.ts';
import { notifyOpened } from './application/notify.ts';
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
const profiles = new ProfileConfigReader(config.HERMES_HOME, config.FACTORY_REPO);
const sessions = new SessionReader(config.profilesDir);
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

const hub = new Hub(
  {
    owner: config.GITHUB_OWNER,
    boardName: config.HERMES_BOARD,
    dashboardUrl: config.DASHBOARD_URL,
    addresses: config.addresses,
    heldAfterSeconds: config.HELD_AFTER_MINUTES * 60,
    keepFinishedMs: 24 * 3600_000,
  },
  { store, profiles, github, log: log.child({ component: 'hub' }), now },
);
const buffer = new StreamBuffer();
hub.subscribe((event) => buffer.push(event));

const notifier = new PushNotifier(store, vapidKeys(store), config.VAPID_SUBJECT);
hub.interventionListeners.add((opened, all) => {
  notifyOpened({ store, notifier, log, now }, opened, all).catch((error: unknown) =>
    log.error({ component: 'push', error: String(error) }, 'notification en échec'),
  );
});

// Kanban : data_version toutes les 300 ms, comme le dashboard d'Hermès ; réouverture si la base disparaît.
let kanban: KanbanReader | null = null;
const pollKanban = () => {
  try {
    kanban ??= new KanbanReader(config.kanbanDb);
    if (kanban.changed()) hub.applyKanban(kanban.read(), now());
  } catch (error) {
    hub.kanbanFailed(String(error instanceof Error ? error.message : error));
    log.error(
      { component: 'kanban', path: config.kanbanDb, error: String(error) },
      'lecture du kanban en échec',
    );
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

const timers = [
  setInterval(pollKanban, 300),
  setInterval(() => hub.flush(), 250),
  setInterval(() => hub.tick(), 15_000),
  setInterval(() => hub.reloadConfig(), 5 * 60_000),
  setInterval(() => void refreshGitHub(), 30_000),
  setInterval(() => store.purgeActivity(now() - 30 * 86_400_000), 6 * 3600_000),
];
void refreshGitHub();

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
    files: new CardFiles(config.boardDir, config.CLAUDE_PROJECTS),
    owner: config.GITHUB_OWNER,
    boardName: config.HERMES_BOARD,
    dashboardUrl: config.DASHBOARD_URL,
    heldAfterSeconds: config.HELD_AFTER_MINUTES * 60,
    now,
  },
  unblock: unblockDeps,
  notifier,
  githubAuth,
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

const stop = (signal: string) => {
  log.info({ component: 'server', signal }, 'arrêt demandé');
  for (const timer of timers) clearInterval(timer);
  server.close(() => {
    kanban?.close();
    sessions.close();
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5_000).unref();
};
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
