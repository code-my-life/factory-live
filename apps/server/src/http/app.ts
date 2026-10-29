import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  ApiError,
  ClientLog,
  GitHubAccess,
  HermesHookBody,
  HistoryStats,
  IssueDetail,
  ProbeReport,
  ProfileView,
  PushKey,
  PushSubscriptionInput,
  ServiceHealth,
  STREAM_PING,
  STREAM_PING_EVERY_MS,
  Snapshot,
  TranscriptView,
  UnblockProgress,
  UnblockRequest,
  UsageReport,
  msg,
} from '@factory-live/contracts';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { GitHubAuthError } from '../adapters/github/app.ts';
import type { GitHubAppAuth } from '../adapters/github/app.ts';
import type { PushNotifier } from '../adapters/push/webpush.ts';
import type { HistoryStore } from '../adapters/store/history.ts';
import { toHookEvent } from '../ingest/hermes.ts';
import { ReplayGuard, verifySignature } from '../ingest/signature.ts';
import type { Hub } from '../application/hub.ts';
import {
  historyStats,
  issueDetail,
  profileViews,
  transcripts,
  usageReport,
} from '../application/views.ts';
import type { ViewDeps } from '../application/views.ts';
import type { Logger } from '../logger.ts';
import { UnblockError, unblockIntervention } from '../application/unblock.ts';
import type { UnblockDeps } from '../application/unblock.ts';
import { navigationGuard, requestOrigin, writeGuard } from './guard.ts';
import { PAGE_TEXTS, localeCookie, pageLocale } from './pages.ts';
import type { PageLocale } from './pages.ts';
import type { StreamBuffer } from './stream.ts';

export interface AppDeps {
  hub: Hub;
  buffer: StreamBuffer;
  store: HistoryStore;
  views: ViewDeps;
  unblock: UnblockDeps;
  notifier: PushNotifier | null;
  githubAuth: GitHubAppAuth | null;
  hookSecret: string | null;
  origins: readonly string[];
  tailscaleLogins: readonly string[];
  webDist: string | null;
  /** Battement du flux quand rien d'autre ne part (15 s ; plus court dans les tests). */
  streamPingMs?: number;
  log: Logger;
  now: () => number;
  version: string;
}

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});
const errors = {
  400: json(ApiError, 'Requête invalide'),
  403: json(ApiError, 'Écriture refusée'),
  404: json(ApiError, 'Introuvable'),
};

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://avatars.githubusercontent.com",
  "connect-src 'self'",
  "font-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

export function createApp(deps: AppDeps) {
  const app = new OpenAPIHono<{ Variables: { actor: string } }>({
    defaultHook: (result, c) => {
      if (!result.success)
        return c.json(
          {
            error: 'Requête invalide',
            code: 'invalid_request' as const,
            detail: result.error.issues.map((issue) => issue.message).join(' ; '),
          },
          400,
        );
      return undefined;
    },
  });
  const guard = writeGuard({
    origins: deps.origins,
    tailscaleLogins: deps.tailscaleLogins,
    now: deps.now,
  });
  const replay = new ReplayGuard();
  const decoder = new TextDecoder();

  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'same-origin');
    if (!c.res.headers.has('Content-Security-Policy')) c.header('Content-Security-Policy', CSP);
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  });

  app.onError((error, c) => {
    deps.log.error(
      { component: 'http', path: c.req.path, error: String(error), stack: error.stack },
      'erreur non prévue',
    );
    return c.json({ error: 'Erreur interne de factory-live', code: 'internal' }, 500);
  });

  app.get('/healthz', (c) => c.json({ ok: true, version: deps.version }));

  // --- Ingestion signée (Hermès, sonde) ------------------------------------------------------

  app.post(
    '/api/ingest/hermes',
    bodyLimit({
      maxSize: 4 * 1024 * 1024,
      onError: (c) => c.json({ error: 'Corps trop gros' }, 413),
    }),
    async (c) => {
      if (!deps.hookSecret) return c.json({ error: 'Ingestion désactivée : secret absent' }, 503);
      const raw = new Uint8Array(await c.req.arrayBuffer());
      if (!verifySignature(raw, c.req.header('x-hermes-signature-256'), deps.hookSecret))
        return c.json({ error: 'Signature invalide' }, 401);
      const parsed = HermesHookBody.safeParse(safeJson(decoder.decode(raw)));
      if (!parsed.success) return c.json({ error: 'Corps inattendu' }, 400);
      const verdict = replay.check(
        parsed.data.delivery_id,
        Date.parse(parsed.data.timestamp),
        deps.now(),
      );
      if (verdict === 'stale') return c.json({ error: 'Livraison hors fenêtre' }, 400);
      if (verdict === 'fresh') deps.hub.applyHook(toHookEvent(parsed.data));
      return c.body(null, 202);
    },
  );

  app.post('/api/ingest/health', bodyLimit({ maxSize: 256 * 1024 }), async (c) => {
    if (!deps.hookSecret) return c.json({ error: 'Ingestion désactivée : secret absent' }, 503);
    const raw = new Uint8Array(await c.req.arrayBuffer());
    if (!verifySignature(raw, c.req.header('x-factory-live-signature-256'), deps.hookSecret))
      return c.json({ error: 'Signature invalide' }, 401);
    const parsed = ProbeReport.safeParse(safeJson(decoder.decode(raw)));
    if (!parsed.success) return c.json({ error: 'Rapport inattendu' }, 400);
    const verdict = replay.check(
      `probe:${parsed.data.gatewayPid}:${parsed.data.at}`,
      Date.parse(parsed.data.at),
      deps.now(),
    );
    if (verdict === 'stale') return c.json({ error: 'Rapport hors fenêtre' }, 400);
    if (verdict === 'fresh') deps.hub.applyProbe(parsed.data, deps.now());
    return c.body(null, 202);
  });

  // --- Lecture ---------------------------------------------------------------------------------

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/snapshot',
      responses: { 200: json(Snapshot, 'Tout l’accueil en un envoi') },
    }),
    (c) => c.json(deps.hub.snapshot(), 200),
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/issues/{repo}/{number}',
      request: {
        params: z.object({
          repo: z.string().regex(/^[\w.-]+$/),
          number: z.coerce.number().int().positive(),
        }),
      },
      responses: { 200: json(IssueDetail, 'Détail d’une issue'), ...errors },
    }),
    (c) => {
      const { repo, number } = c.req.valid('param');
      const detail = issueDetail(deps.views, `${repo}#${number}`);
      return detail
        ? c.json(detail, 200)
        : c.json({ error: 'Issue inconnue de la factory', code: 'not_found' as const }, 404);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/runs/{id}/transcripts',
      request: { params: z.object({ id: z.coerce.number().int().positive() }) },
      responses: { 200: json(z.array(TranscriptView), 'Transcriptions du run'), ...errors },
    }),
    (c) => {
      const views = transcripts(deps.views, c.req.valid('param').id);
      return views
        ? c.json(views, 200)
        : c.json({ error: 'Run inconnu', code: 'not_found' as const }, 404);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/profiles',
      responses: { 200: json(z.array(ProfileView), 'Profils de la factory') },
    }),
    (c) => c.json(profileViews(deps.views), 200),
  );

  const period = z.object({
    days: z.coerce
      .number()
      .int()
      .refine((value) => [1, 7, 30, 90].includes(value))
      .default(7),
  });
  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/usage',
      request: { query: period },
      responses: { 200: json(UsageReport, 'Jetons, coûts, 429'), ...errors },
    }),
    (c) => c.json(usageReport(deps.views, c.req.valid('query').days), 200),
  );
  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/history',
      request: { query: period },
      responses: { 200: json(HistoryStats, 'Historique et statistiques'), ...errors },
    }),
    (c) => c.json(historyStats(deps.views, c.req.valid('query').days), 200),
  );
  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/sources',
      responses: { 200: json(z.array(ServiceHealth), 'Sources de factory-live') },
    }),
    (c) =>
      c.json(
        deps.hub.snapshot().health.filter((item) => item.group === 'factory-live'),
        200,
      ),
  );

  app.get('/api/stream', (c) => {
    c.header('X-Accel-Buffering', 'no');
    c.header('Cache-Control', 'no-cache, no-transform');
    return streamSSE(c, async (stream) => {
      const lastId = Number(
        c.req.header('last-event-id') ?? c.req.query('lastEventId') ?? Number.NaN,
      );
      const replayed = Number.isFinite(lastId) ? deps.buffer.since(lastId) : null;
      const queue = replayed ?? [
        {
          id: deps.buffer.lastId,
          event: { type: 'snapshot' as const, snapshot: deps.hub.snapshot() },
        },
      ];
      let wake: (() => void) | null = null;
      let closed = false;
      const unsubscribe = deps.buffer.subscribe((item) => {
        queue.push(item);
        wake?.();
      });
      stream.onAbort(() => {
        closed = true;
        unsubscribe();
        wake?.();
      });
      await stream.write('retry: 3000\n\n');
      while (!closed) {
        while (queue.length > 0 && !closed) {
          const item = queue.shift() as (typeof queue)[number];
          await stream.writeSSE({
            id: String(item.id),
            event: item.event.type,
            data: JSON.stringify(item.event),
          });
        }
        const waited = await new Promise<'event' | 'timeout'>((resolve) => {
          const timer = setTimeout(
            () => resolve('timeout'),
            deps.streamPingMs ?? STREAM_PING_EVERY_MS,
          );
          wake = () => {
            clearTimeout(timer);
            resolve('event');
          };
        });
        wake = null;
        if (waited === 'timeout' && !closed)
          await stream.writeSSE({ event: STREAM_PING, data: '{}' });
      }
    });
  });

  // --- Écritures (garde : ce PC ou ton login Tailscale) -------------------------------------------

  app.use('/api/interventions/*', guard);
  app.use('/api/push/subscribe', guard);
  app.use('/api/push/unsubscribe', guard);
  app.use('/api/push/test', guard);

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/interventions/{id}/unblock',
      request: {
        params: z.object({ id: z.string().max(200) }),
        body: { content: { 'application/json': { schema: UnblockRequest } } },
      },
      responses: {
        200: json(UnblockProgress, 'Réponse postée sur l’issue'),
        ...errors,
        409: json(ApiError, 'Pas de déblocage depuis l’app'),
        502: json(ApiError, 'GitHub a refusé'),
        503: json(ApiError, 'Jeton absent'),
      },
    }),
    async (c) => {
      try {
        const record = await unblockIntervention(
          deps.unblock,
          c.req.valid('param').id,
          c.req.valid('json').text,
          c.get('actor'),
        );
        return c.json(
          {
            state: record.state === 'failed' ? 'rejected' : record.state,
            text: record.text,
            commentUrl: record.commentUrl,
            at: new Date(record.updatedAt).toISOString(),
          },
          200,
        );
      } catch (error) {
        if (error instanceof UnblockError)
          return c.json({ error: error.message, code: error.code }, error.status);
        throw error;
      }
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/push/key',
      responses: {
        200: json(PushKey, 'Clé publique VAPID'),
        503: json(ApiError, 'Push indisponible'),
      },
    }),
    (c) =>
      deps.notifier
        ? c.json({ publicKey: deps.notifier.publicKey }, 200)
        : c.json({ error: 'Notifications indisponibles', code: 'push_unavailable' as const }, 503),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/push/subscribe',
      request: { body: { content: { 'application/json': { schema: PushSubscriptionInput } } } },
      responses: { 204: { description: 'Abonné' }, ...errors },
    }),
    (c) => {
      const input = c.req.valid('json');
      deps.store.saveSubscription(
        { endpoint: input.endpoint, keys: input.keys, device: input.device ?? null },
        deps.now(),
      );
      deps.store.audit(c.get('actor'), 'push-subscribe', input.device ?? null, deps.now());
      return c.body(null, 204);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/push/unsubscribe',
      request: {
        body: { content: { 'application/json': { schema: z.object({ endpoint: z.url() }) } } },
      },
      responses: { 204: { description: 'Désabonné' }, ...errors },
    }),
    (c) => {
      deps.store.removeSubscription(c.req.valid('json').endpoint);
      return c.body(null, 204);
    },
  );

  app.post('/api/push/test', async (c) => {
    if (!deps.notifier)
      return c.json({ error: 'Notifications indisponibles', code: 'push_unavailable' }, 503);
    const result = await deps.notifier.notify({
      where: null,
      title: msg('push.test.title'),
      body: msg('push.test.body'),
      url: '/settings',
      tag: 'test',
      badge: deps.hub.openInterventions.length,
    });
    return c.json(result, 200);
  });

  app.post('/api/client-logs', bodyLimit({ maxSize: 32 * 1024 }), async (c) => {
    const origin = c.req.header('origin');
    if (origin && !deps.origins.includes(origin))
      return c.json({ error: 'Origine refusée', code: 'origin_refused' }, 403);
    const parsed = ClientLog.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: 'Journal inattendu', code: 'invalid_request' }, 400);
    deps.log[parsed.data.level === 'info' ? 'info' : parsed.data.level](
      { component: 'client', ...parsed.data },
      parsed.data.message,
    );
    return c.body(null, 204);
  });

  // --- GitHub : App factory-live (lectures) et connexion de Clément (déblocage) ------------------------

  const navigation = navigationGuard({
    origins: deps.origins,
    tailscaleLogins: deps.tailscaleLogins,
  });
  /** Une page du parcours GitHub, dans la langue de Clément (`pages.ts`), qu'elle retient pour le retour. */
  const githubPage = (
    c: Context,
    locale: PageLocale,
    title: string,
    body: string,
    status: 200 | 400 | 403 | 409 | 502 = 200,
  ) => {
    const cookie = localeCookie(c);
    return new Response(
      `<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>` +
        `<body style="margin:0;background:#0d1117;color:#f0f6fc;font:16px/1.5 system-ui,sans-serif"><main style="max-width:36rem;margin:10vh auto;padding:0 16px">` +
        `<h1 style="font-size:24px">${title}</h1>${body}</main></body></html>`,
      {
        status,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy':
            "default-src 'none'; style-src 'unsafe-inline'; form-action https://github.com; base-uri 'none'; frame-ancestors 'none'",
          ...(cookie ? { 'Set-Cookie': cookie } : {}),
        },
      },
    );
  };
  const escapeHtml = (text: string) =>
    text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
  const authFailure = (c: Context, error: unknown) => {
    const locale = pageLocale(c);
    const texts = PAGE_TEXTS[locale];
    const status =
      error instanceof GitHubAuthError && [400, 403, 409, 502].includes(error.status)
        ? (error.status as 400 | 403 | 409 | 502)
        : 502;
    deps.log.warn({ component: 'github', error: String(error) }, 'parcours GitHub en échec');
    const message =
      error instanceof GitHubAuthError
        ? texts.failure(error.failure)
        : error instanceof Error
          ? error.message
          : String(error);
    return githubPage(
      c,
      locale,
      texts.failureTitle,
      `<p>${escapeHtml(message)}</p><p><a style="color:#4493f8" href="/">${escapeHtml(texts.back)}</a></p>`,
      status,
    );
  };
  const unavailable = (c: Context) => c.text(PAGE_TEXTS[pageLocale(c)].unavailable, 503);

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/github/status',
      responses: { 200: json(GitHubAccess, 'Accès de factory-live à GitHub') },
    }),
    (c) => {
      const status = deps.githubAuth?.status() ?? { mode: 'none' as const, app: null, user: null };
      return c.json(
        {
          ...status,
          user: status.user
            ? { ...status.user, expiresAt: new Date(status.user.expiresAt).toISOString() }
            : null,
          setupUrl: '/api/github/setup',
          loginUrl: '/api/github/login',
        },
        200,
      );
    },
  );

  app.get('/api/github/setup', navigation, (c) => {
    if (!deps.githubAuth) return unavailable(c);
    const locale = pageLocale(c);
    const texts = PAGE_TEXTS[locale];
    const { action, manifest } = deps.githubAuth.manifestRequest(
      requestOrigin(deps.origins, c.req.header('host')),
    );
    return githubPage(
      c,
      locale,
      texts.setupTitle,
      `<p>${escapeHtml(texts.setupRights)}</p><p>${escapeHtml(texts.setupSteps)}</p>` +
        `<form method="post" action="${escapeHtml(action)}"><input type="hidden" name="manifest" value="${escapeHtml(JSON.stringify(manifest))}">` +
        `<button style="font:inherit;padding:8px 16px;border-radius:6px;border:0;background:#238636;color:#fff;cursor:pointer">${escapeHtml(texts.setupContinue)}</button></form>`,
    );
  });

  app.get('/api/github/manifest/callback', navigation, async (c) => {
    if (!deps.githubAuth) return unavailable(c);
    try {
      await deps.githubAuth.completeManifest(c.req.query('code') ?? '', c.req.query('state') ?? '');
      deps.store.audit('github', 'app-created', null, deps.now());
      return c.redirect(deps.githubAuth.installUrl() ?? '/', 303);
    } catch (error) {
      return authFailure(c, error);
    }
  });

  app.get('/api/github/installed', navigation, (c) =>
    c.redirect('/settings?github=installed', 303),
  );

  app.get('/api/github/login', navigation, (c) => {
    if (!deps.githubAuth) return unavailable(c);
    try {
      const target = deps.githubAuth.authorizeUrl(
        requestOrigin(deps.origins, c.req.header('host')),
      );
      // La langue passée par la PWA vaut pour la page d'échec, au retour de GitHub.
      const cookie = localeCookie(c);
      if (cookie) c.header('Set-Cookie', cookie);
      return c.redirect(target, 303);
    } catch (error) {
      return authFailure(c, error);
    }
  });

  app.get('/api/github/oauth/callback', navigation, async (c) => {
    if (!deps.githubAuth) return unavailable(c);
    if (c.req.query('error')) {
      const detail = c.req.query('error_description') ?? c.req.query('error') ?? '';
      return authFailure(
        c,
        new GitHubAuthError(
          400,
          { reason: 'login_denied', detail },
          `Connexion refusée sur GitHub : ${detail}`,
        ),
      );
    }
    try {
      const user = await deps.githubAuth.completeLogin(
        c.req.query('code') ?? '',
        c.req.query('state') ?? '',
      );
      deps.store.audit(`github:${user.login}`, 'github-login', null, deps.now());
      return c.redirect('/settings?github=connected', 303);
    } catch (error) {
      return authFailure(c, error);
    }
  });

  app.use('/api/github/logout', guard);
  app.post('/api/github/logout', (c) => {
    deps.githubAuth?.logout();
    deps.store.audit(c.get('actor'), 'github-logout', null, deps.now());
    return c.body(null, 204);
  });

  app.doc31('/api/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'factory-live',
      version: deps.version,
      description: 'La factory Hermès en temps réel',
    },
  });

  app.all('/api/*', (c) => c.json({ error: 'Route inconnue', code: 'not_found' }, 404));

  // --- PWA -------------------------------------------------------------------------------------

  if (deps.webDist && existsSync(join(deps.webDist, 'index.html'))) {
    const root = normalize(deps.webDist);
    const index = readFileSync(join(root, 'index.html'));
    app.get('*', (c) => {
      const path = normalize(join(root, decodeURIComponent(c.req.path)));
      if (path.startsWith(root + sep) && existsSync(path) && !path.endsWith(sep)) {
        try {
          const body = readFileSync(path);
          const immutable = path.includes(`${sep}assets${sep}`);
          return c.body(body, 200, {
            'Content-Type': MIME[extname(path)] ?? 'application/octet-stream',
            'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
          });
        } catch {
          // dossier : on retombe sur l'application
        }
      }
      return c.body(index, 200, {
        'Content-Type': MIME['.html'] as string,
        'Cache-Control': 'no-cache',
      });
    });
  }

  return app;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
