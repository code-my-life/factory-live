import {
  ApiError,
  GitHubAccess,
  IssueDetail,
  PushPayload,
  Snapshot,
  StreamEvent,
  msg,
} from '@factory-live/contracts';
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { HOOK_TIMEOUT_MESSAGE } from '@factory-live/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackUnblockReactions } from '../application/unblock.ts';
import { sign } from '../ingest/signature.ts';
import { NOW, NOW_S, ORIGINS, SECRET, harness } from '../test/harness.ts';
import type { Harness } from '../test/harness.ts';
import { insertEvent, insertRun, insertTask, schemaFor } from '../test/hermes-fixtures.ts';

let h: Harness;

beforeEach(() => {
  h = harness();
});

afterEach(() => {
  h.close();
});

/** Ce PC, tel que le navigateur l'annonce : sans un hôte autorisé, factory-live refuse tout (DNS rebinding). */
const THIS_PC = { host: 'localhost:8446' };
/** Hermès et la sonde postent sur 127.0.0.1, au port du service (install.sh de la factory). */
const FROM_HERMES = { host: '127.0.0.1:8446' };

function hook(
  event: string,
  patch: Record<string, unknown> = {},
  deliveryId = `d-${Math.random().toString(16).slice(2)}`,
) {
  return {
    hook_event_name: event,
    profile: 'coder',
    tool_name: null,
    tool_input: null,
    session_id: '20261028_170000_abcdef',
    cwd: '/home/user/.hermes/kanban/boards/factory/workspaces/t_1a9f0049',
    extra: {},
    delivery_id: deliveryId,
    timestamp: new Date(NOW - 1_000).toISOString(),
    ...patch,
  };
}

function postHook(body: unknown, secret = SECRET) {
  const raw = JSON.stringify(body);
  return h.app.request('/api/ingest/hermes', {
    method: 'POST',
    body: raw,
    headers: {
      ...FROM_HERMES,
      'content-type': 'application/json',
      'x-hermes-signature-256': sign(raw, secret),
    },
  });
}

const LOCAL = {
  host: 'localhost:8446',
  origin: 'http://localhost:8446',
  'x-factory-live': '1',
  'content-type': 'application/json',
};
/** Statut et code d'un refus de l'API. */
async function refusal(response: Response): Promise<[number, string | undefined]> {
  return [response.status, ApiError.parse(await response.json()).code];
}

const TAILNET = {
  host: 'machine.tailnet.ts.net:8446',
  origin: 'https://machine.tailnet.ts.net:8446',
  'x-factory-live': '1',
  'content-type': 'application/json',
};

async function snapshot() {
  return Snapshot.parse(await (await h.app.request('/api/snapshot', { headers: THIS_PC })).json());
}

describe('instantané', () => {
  it('respecte le contrat et montre l’issue, sa station et l’intervention qui attend Clément', async () => {
    const data = await snapshot();
    const issue = data.issues.find((item) => item.key === 'cv-site#49');
    expect(issue).toMatchObject({
      station: 'implementation',
      status: 'waiting_human',
      url: 'https://github.com/code-my-life/cv-site/issues/49',
    });
    expect(data.interventions).toEqual([
      expect.objectContaining({
        kind: 'needs_input',
        issueKey: 'cv-site#49',
        push: true,
        title: 'Quelle base de données ?',
      }),
    ]);
    expect(data.stations.map((station) => station.id)).toEqual([
      'intake',
      'brief',
      'implementation',
      'gate',
      'release',
      'done',
    ]);
    expect(data.agents.map((agent) => agent.profile)).toEqual([
      'coordinator',
      'coder',
      'gate',
      'release',
    ]);
    expect(data.factory).toMatchObject({ maxInProgress: 2, running: 0, paused: false });
  });

  it('dit où ouvrir l’app : ce PC et l’adresse tailnet de la configuration', async () => {
    expect((await snapshot()).addresses).toEqual({
      local: 'http://localhost:8446',
      tailnet: 'https://machine.tailnet.ts.net:8446',
    });
  });
});

describe('contrôle de l’hôte, contre le DNS rebinding', () => {
  const as = (host: string | null, path = '/api/snapshot') =>
    h.app.request(path, { headers: host === null ? {} : { host } });
  const READS = [
    '/healthz',
    '/api/snapshot',
    '/api/stream',
    '/api/profiles',
    '/api/issues/cv-site/49',
    '/api/runs/1/transcripts',
    '/api/usage',
    '/api/history',
    '/api/sources',
    '/api/push/key',
    '/api/github/status',
    '/api/openapi.json',
    '/settings',
  ];

  it('refuse toute route, lecture comprise, à un hôte inconnu, sur un autre port ou absent', async () => {
    for (const path of READS)
      for (const host of ['evil.example:8446', 'evil.example', 'localhost:5173', null])
        expect(await refusal(await as(host, path)), `${path} ${String(host)}`).toEqual([
          421,
          'host_refused',
        ]);
  });

  it('refuse aussi les écritures et l’ingestion, avant leur propre garde', async () => {
    const id = encodeURIComponent((await snapshot()).interventions[0]?.id ?? '');
    const unblock = await h.app.request(`/api/interventions/${id}/unblock`, {
      method: 'POST',
      headers: { ...LOCAL, host: 'evil.example:8446' },
      body: JSON.stringify({ text: 'ok' }),
    });
    expect(await refusal(unblock)).toEqual([421, 'host_refused']);
    const raw = JSON.stringify(
      hook('pre_tool_call', { tool_name: 'terminal', tool_input: { command: 'npm test' } }),
    );
    const ingest = await h.app.request('/api/ingest/hermes', {
      method: 'POST',
      body: raw,
      headers: { host: 'evil.example:8446', 'x-hermes-signature-256': sign(raw, SECRET) },
    });
    expect(await refusal(ingest)).toEqual([421, 'host_refused']);
    expect(h.github.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    expect((await snapshot()).agents.find((agent) => agent.profile === 'coder')?.state).not.toBe(
      'tool',
    );
  });

  it('laisse passer ce PC sur le port du service et l’hôte tailnet de la configuration', async () => {
    for (const host of [
      'localhost:8446',
      '127.0.0.1:8446',
      '[::1]:8446',
      'LocalHost:8446',
      TAILNET.host,
    ])
      expect((await as(host)).status, host).toBe(200);
  });

  it('garde /healthz joignable par le healthcheck Docker (127.0.0.1 au port du service)', async () => {
    const response = await as('127.0.0.1:8446', '/healthz');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, version: 'test' });
  });
});

describe('ingestion des webhooks d’Hermès', () => {
  it('applique un webhook signé : l’agent et le fil changent', async () => {
    const response = await postHook(
      hook('pre_tool_call', { tool_name: 'terminal', tool_input: { command: 'npm test' } }),
    );
    expect(response.status).toBe(202);
    const data = await snapshot();
    expect(data.agents.find((agent) => agent.profile === 'coder')).toMatchObject({
      state: 'tool',
      cardId: 't_1a9f0049',
      issueKey: 'cv-site#49',
      action: { label: 'terminal', detail: 'npm test' },
    });
    expect(data.activity.at(-1)).toMatchObject({
      kind: 'tool',
      status: 'running',
      issueKey: 'cv-site#49',
    });
  });

  it('rattache la reprise de la gate à sa carte, pas à la carte impl dont elle occupe le worktree', async () => {
    const worktree = '/home/user/perso/cv-site/.worktrees/t_1a9f0049';
    insertTask(h.writer, {
      id: 't_9a7e0049',
      title: 'rework cv-site#49 : tests manquants (revue gate)',
      status: 'running',
      assignee: 'gate',
      createdAt: NOW_S - 60,
    });
    h.writer
      .prepare(
        "UPDATE tasks SET workspace_kind = 'dir', workspace_path = ? WHERE id = 't_9a7e0049'",
      )
      .run(worktree);
    h.syncKanban();
    await postHook(
      hook('pre_tool_call', {
        profile: 'gate',
        cwd: worktree,
        tool_name: 'terminal',
        tool_input: { command: 'npm test' },
      }),
    );
    const data = await snapshot();
    expect(data.agents.find((agent) => agent.profile === 'gate')).toMatchObject({
      cardId: 't_9a7e0049',
      state: 'tool',
      action: { label: 'terminal', detail: 'npm test' },
    });
    expect(data.activity.at(-1)).toMatchObject({ profile: 'gate', cardId: 't_9a7e0049' });
  });

  it('refuse une signature fausse, n’applique pas deux fois un nouvel essai, refuse un envoi périmé', async () => {
    expect((await postHook(hook('pre_tool_call'), 'autre-secret')).status).toBe(401);
    const body = hook(
      'on_skill_lifecycle',
      { extra: { action: 'loaded', skill_name: 'factory-author-proof' } },
      'delivery-fixe',
    );
    expect((await postHook(body)).status).toBe(202);
    expect((await postHook(body)).status).toBe(202);
    expect((await snapshot()).activity.filter((event) => event.kind === 'skill')).toHaveLength(1);
    expect(
      (
        await postHook(
          hook('pre_tool_call', { timestamp: new Date(NOW - 3_600_000).toISOString() }),
        )
      ).status,
    ).toBe(400);
  });

  it('refuse un corps qui n’est pas un webhook d’Hermès', async () => {
    expect((await postHook({ bonjour: 1 })).status).toBe(400);
  });

  it('prend le rapport signé de la sonde : gateway en marche, pause visible', async () => {
    const report = JSON.stringify({
      v: 1,
      probe: 'factory-live-probe',
      at: new Date(NOW).toISOString().replace('Z', '+00:00'),
      gatewayPid: 4242,
      kanban: { max_in_progress: 3, max_in_progress_per_profile: 1 },
      checks: [
        {
          id: 'pause',
          label: 'Pause (ESTOP)',
          status: 'degraded',
          detail: 'Factory en pause : maintenance',
          metrics: {},
        },
      ],
    });
    const response = await h.app.request('/api/ingest/health', {
      method: 'POST',
      body: report,
      headers: { ...FROM_HERMES, 'x-factory-live-signature-256': sign(report, SECRET) },
    });
    expect(response.status).toBe(202);
    const data = await snapshot();
    expect(data.factory).toMatchObject({
      paused: true,
      pauseReason: 'maintenance',
      live: true,
      maxInProgress: 3,
    });
    expect(data.health.find((item) => item.id === 'gateway')).toMatchObject({ status: 'ok' });
  });
});

describe('déblocage depuis l’app', () => {
  const interventionId = async () => (await snapshot()).interventions[0]?.id as string;

  it('poste « /factory unblock <réponse> » sur l’issue, une seule fois', async () => {
    const id = await interventionId();
    const request = () =>
      h.app.request(`/api/interventions/${encodeURIComponent(id)}/unblock`, {
        method: 'POST',
        headers: LOCAL,
        body: JSON.stringify({ text: 'Prends PostgreSQL' }),
      });
    const first = await request();
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      state: 'sent',
      commentUrl: 'https://github.com/code-my-life/cv-site/issues/49#issuecomment-4242',
    });
    expect((await request()).status).toBe(200);
    const posts = h.github.calls.filter((call) => call.method === 'POST');
    expect(posts).toEqual([
      {
        method: 'POST',
        url: 'https://api.github.com/repos/code-my-life/cv-site/issues/49/comments',
        body: { body: '/factory unblock Prends PostgreSQL' },
        auth: 'Bearer jeton',
      },
    ]);
    expect((await snapshot()).interventions[0]?.unblock).toMatchObject({
      state: 'sent',
      text: 'Prends PostgreSQL',
    });
  });

  it('ne croit que la réaction du bot de la factory : celle d’un passant ne change rien', async () => {
    const id = await interventionId();
    await h.app.request(`/api/interventions/${encodeURIComponent(id)}/unblock`, {
      method: 'POST',
      headers: LOCAL,
      body: JSON.stringify({ text: 'Prends PostgreSQL' }),
    });
    h.github.reactions.push(
      { content: '+1', user: { login: 'passant' } },
      { content: 'confused', user: { login: 'passant' } },
    );
    await trackUnblockReactions(h.unblock);
    expect(h.store.unblock(id)?.state).toBe('sent');
    h.github.reactions.push({ content: 'confused', user: { login: 'Code-My-Life-Factory[bot]' } });
    await trackUnblockReactions(h.unblock);
    expect(h.store.unblock(id)?.state).toBe('rejected');
  });

  it('suit la carte jusqu’à sa reprise', async () => {
    const id = await interventionId();
    await h.app.request(`/api/interventions/${encodeURIComponent(id)}/unblock`, {
      method: 'POST',
      headers: LOCAL,
      body: JSON.stringify({ text: 'Prends PostgreSQL' }),
    });
    insertEvent(h.writer, { taskId: 't_1a9f0049', kind: 'unblocked', createdAt: NOW_S + 5 });
    h.writer
      .prepare("UPDATE tasks SET status = 'ready', block_kind = NULL WHERE id = 't_1a9f0049'")
      .run();
    h.syncKanban();
    expect(h.store.unblock(id)?.state).toBe('resumed');
  });

  it('écrit seulement depuis ce PC ou le login Tailscale autorisé, avec l’en-tête anti-CSRF', async () => {
    const id = encodeURIComponent(await interventionId());
    const post = (headers: Record<string, string>) =>
      h.app.request(`/api/interventions/${id}/unblock`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text: 'ok' }),
      });
    expect(await refusal(await post({ ...LOCAL, 'x-factory-live': '' }))).toEqual([
      403,
      'csrf_missing',
    ]);
    expect(await refusal(await post({ ...LOCAL, origin: 'https://evil.example' }))).toEqual([
      403,
      'origin_refused',
    ]);
    expect(await refusal(await post({ ...TAILNET }))).toEqual([403, 'write_local_only']);
    expect(
      await refusal(await post({ ...TAILNET, 'tailscale-user-login': 'intrus@github' })),
    ).toEqual([403, 'write_login_refused']);
    expect(await refusal(await post({ ...LOCAL, 'x-forwarded-for': '100.64.0.7' }))).toEqual([
      403,
      'write_local_only',
    ]);
    expect(h.github.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    expect((await post({ ...TAILNET, 'tailscale-user-login': 'alice@github' })).status).toBe(200);
  });

  it('refuse une réponse vide et une intervention inconnue, avec un code que la PWA écrit dans sa langue', async () => {
    const id = encodeURIComponent(await interventionId());
    expect(
      await refusal(
        await h.app.request(`/api/interventions/${id}/unblock`, {
          method: 'POST',
          headers: LOCAL,
          body: JSON.stringify({ text: '   ' }),
        }),
      ),
    ).toEqual([400, 'invalid_request']);
    expect(
      await refusal(
        await h.app.request('/api/interventions/inconnue/unblock', {
          method: 'POST',
          headers: LOCAL,
          body: JSON.stringify({ text: 'ok' }),
        }),
      ),
    ).toEqual([404, 'intervention_unknown']);
  });
});

describe('détail d’une issue', () => {
  it('respecte le contrat : cartes, runs, timeline', async () => {
    const response = await h.app.request('/api/issues/cv-site/49', { headers: THIS_PC });
    expect(response.status).toBe(200);
    const detail = IssueDetail.parse(await response.json());
    expect(detail.cards.map((card) => [card.id, card.kind, card.station])).toEqual([
      ['t_b1ef0049', 'brief', 'brief'],
      ['t_1a9f0049', 'impl', 'implementation'],
    ]);
    expect(detail.cards[1]).toMatchObject({
      blockKind: 'needs_input',
      blockReason: 'Quelle base de données ?\nPostgreSQL ou SQLite ?',
      parents: ['t_b1ef0049'],
    });
    expect(detail.timeline.map((entry) => entry.label)).toContainEqual(
      msg('timeline.blocked', { kind: 'needs_input' }),
    );
    expect(detail.issue.prUrl).toBeNull();
    expect((await h.app.request('/api/issues/cv-site/50', { headers: THIS_PC })).status).toBe(404);
    expect((await h.app.request('/api/issues/..%2Fetc/1', { headers: THIS_PC })).status).toBe(400);
  });
});

describe('PR relevée par la factory', () => {
  it('donne le lien de la PR noté dans les runs, même sans GitHub relié', async () => {
    insertRun(h.writer, {
      taskId: 't_1a9f0049',
      profile: 'coder',
      status: 'done',
      outcome: 'completed',
      startedAt: NOW_S - 300,
      endedAt: NOW_S - 200,
      metadata: { pr_url: 'https://github.com/code-my-life/cv-site/pull/52' },
    });
    h.syncKanban();
    const detail = IssueDetail.parse(
      await (await h.app.request('/api/issues/cv-site/49', { headers: THIS_PC })).json(),
    );
    expect(detail.issue).toMatchObject({
      pr: null,
      prUrl: 'https://github.com/code-my-life/cv-site/pull/52',
    });
  });
});

describe('flux SSE', () => {
  async function read(
    response: Response,
    count: number,
  ): Promise<{ id: string | null; event: string; data: unknown }[]> {
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const events: { id: string | null; event: string; data: unknown }[] = [];
    while (events.length < count) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index: number;
      while ((index = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const fields = Object.fromEntries(
          block
            .split('\n')
            .map((line) => [
              line.slice(0, line.indexOf(':')),
              line.slice(line.indexOf(':') + 1).trim(),
            ]),
        );
        if (fields['data'])
          events.push({
            id: fields['id'] ?? null,
            event: fields['event'] ?? 'message',
            data: JSON.parse(fields['data']),
          });
      }
    }
    await reader.cancel();
    return events;
  }

  it('commence par un instantané, puis n’envoie que ce qui change', async () => {
    const response = await h.app.request('/api/stream', { headers: THIS_PC });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const reading = read(response, 3);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await postHook(
      hook('pre_tool_call', { tool_name: 'terminal', tool_input: { command: 'npm test' } }),
    );
    h.hub.flush();
    const events = await reading;
    expect(events[0]?.event).toBe('snapshot');
    for (const event of events) StreamEvent.parse(event.data);
    expect(events.map((event) => event.event)).toContain('activity');
  });

  it('bat quand rien ne part, sans id pour ne pas fausser la reprise', async () => {
    h.close();
    h = harness({ streamPingMs: 30 });
    const events = await read(await h.app.request('/api/stream', { headers: THIS_PC }), 2);
    expect(events[0]?.event).toBe('snapshot');
    expect(events[1]).toEqual({ id: null, event: 'ping', data: {} });
  });

  it('reprend après une coupure sans renvoyer d’instantané', async () => {
    h.hub.flush();
    const lastId = h.buffer.lastId;
    await postHook(hook('pre_tool_call', { tool_name: 'terminal', tool_input: { command: 'ls' } }));
    h.hub.flush();
    const events = await read(
      await h.app.request('/api/stream', {
        headers: { ...THIS_PC, 'last-event-id': String(lastId) },
      }),
      1,
    );
    expect(events[0]?.event).not.toBe('snapshot');
    expect(Number(events[0]?.id)).toBe(lastId + 1);
  });
});

describe('notifications', () => {
  it('abonne un appareil, puis le test lui envoie une notification', async () => {
    const subscription = {
      endpoint: 'https://web.push.apple.com/abc',
      keys: { p256dh: 'p256', auth: 'auth' },
      device: 'iPhone',
    };
    expect(
      (
        await h.app.request('/api/push/subscribe', {
          method: 'POST',
          headers: TAILNET,
          body: JSON.stringify(subscription),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await h.app.request('/api/push/subscribe', {
          method: 'POST',
          headers: { ...TAILNET, 'tailscale-user-login': 'alice@github' },
          body: JSON.stringify(subscription),
        })
      ).status,
    ).toBe(204);
    expect(await (await h.app.request('/api/push/key', { headers: THIS_PC })).json()).toEqual({
      publicKey: 'BPUBLIC',
    });
    const result = await (
      await h.app.request('/api/push/test', { method: 'POST', headers: LOCAL })
    ).json();
    expect(result).toMatchObject({ sent: 1 });
    expect(PushPayload.parse(JSON.parse(h.pushes[0]?.payload ?? '{}'))).toMatchObject({
      where: null,
      title: msg('push.test.title'),
      body: msg('push.test.body'),
    });
  });
});

describe('GitHub App et connexion de Clément', () => {
  const NAV = { host: 'localhost:8446' };
  const TAILNET_HOST = 'machine.tailnet.ts.net:8446';
  const decode = (html: string) =>
    html.replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
  const status = async () =>
    GitHubAccess.parse(
      await (await h.app.request('/api/github/status', { headers: THIS_PC })).json(),
    );
  const interventionId = async () => (await snapshot()).interventions[0]?.id as string;
  const unblock = async (id: string) =>
    h.app.request(`/api/interventions/${encodeURIComponent(id)}/unblock`, {
      method: 'POST',
      headers: LOCAL,
      body: JSON.stringify({ text: 'Prends PostgreSQL' }),
    });

  /** Le parcours de Clément : page de création, retour de GitHub, connexion, retour de GitHub. */
  async function createAndConnect() {
    const setup = await h.app.request('/api/github/setup', { headers: NAV });
    const page = await setup.text();
    const state = /apps\/new\?state=([\w-]+)"/.exec(page)?.[1] ?? '';
    const created = await h.app.request(`/api/github/manifest/callback?code=abc&state=${state}`, {
      headers: NAV,
    });
    const login = await h.app.request('/api/github/login', { headers: NAV });
    const authorize = new URL(login.headers.get('location') ?? '');
    const back = await h.app.request(
      `/api/github/oauth/callback?code=xyz&state=${authorize.searchParams.get('state') ?? ''}`,
      { headers: NAV },
    );
    return { setup, page, state, created, login, authorize, back };
  }

  it('crée l’App depuis factory-live, puis connecte Clément', async () => {
    expect(await status()).toEqual({
      mode: 'token',
      app: null,
      user: null,
      setupUrl: '/api/github/setup',
      loginUrl: '/api/github/login',
    });
    const { setup, page, state, created, login, authorize, back } = await createAndConnect();
    expect(setup.headers.get('content-security-policy')).toContain(
      'form-action https://github.com',
    );
    const manifest = JSON.parse(
      decode(/name="manifest" value="([^"]+)"/.exec(page)?.[1] ?? '{}'),
    ) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      redirect_url: 'http://localhost:8446/api/github/manifest/callback',
      callback_urls: ORIGINS.map((origin) => `${origin}/api/github/oauth/callback`),
      hook_attributes: { active: false },
    });
    expect(created.status).toBe(303);
    expect(created.headers.get('location')).toBe(
      'https://github.com/apps/factory-live-test/installations/new',
    );
    expect(login.status).toBe(303);
    expect(authorize.searchParams.get('redirect_uri')).toBe(
      'http://localhost:8446/api/github/oauth/callback',
    );
    expect(back.status).toBe(303);
    expect(back.headers.get('location')).toBe('/settings?github=connected');
    expect(await status()).toMatchObject({
      mode: 'app',
      app: { slug: 'factory-live-test', url: 'https://github.com/apps/factory-live-test' },
      user: { login: 'cddev', expiresAt: new Date(NOW + 28_800_000).toISOString() },
    });
    const replay = await h.app.request(`/api/github/manifest/callback?code=abc&state=${state}`, {
      headers: NAV,
    });
    expect(replay.status).toBe(400);
    expect(await replay.text()).toContain('relance la création');
  });

  it('débloque au nom de Clément et lit avec le jeton de l’App', async () => {
    await createAndConnect();
    const id = await interventionId();
    expect((await unblock(id)).status).toBe(200);
    h.github.reactions.push({ content: '+1', user: { login: 'code-my-life-factory[bot]' } });
    await trackUnblockReactions(h.unblock);
    const comment = h.github.calls.find(
      (call) => call.method === 'POST' && call.url.endsWith('/issues/49/comments'),
    );
    expect(comment?.auth).toBe('Bearer ghu_test');
    const reactions = h.github.calls.find((call) => call.url.includes('/reactions'));
    expect(reactions?.auth).toBe('Bearer ghs_test');
    expect(h.store.unblock(id)?.state).toBe('acknowledged');
  });

  it('sans connexion ni jeton de repli, le déblocage demande de se connecter', async () => {
    h.close();
    h = harness({ githubToken: null });
    const response = await unblock(await interventionId());
    const body = ApiError.parse(await response.json());
    expect(response.status).toBe(503);
    expect(body.error).toMatch(/Connecte-toi/);
    expect(body.code).toBe('github_login_required');
    expect(h.github.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
  });

  it('réserve ces pages à ce PC et au login Tailscale de Clément', async () => {
    const get = (headers: Record<string, string>) =>
      h.app.request('/api/github/setup', { headers });
    // Hôte absent ou inconnu : refusé avant même cette garde (contrôle de l'hôte, DNS rebinding).
    expect((await get({})).status).toBe(421);
    expect((await get({ host: 'evil.example' })).status).toBe(421);
    expect((await get({ ...NAV, 'x-forwarded-for': '100.64.0.7' })).status).toBe(403);
    expect(
      (await get({ host: TAILNET_HOST, 'tailscale-user-login': 'intrus@github' })).status,
    ).toBe(403);
    const tailnet = await get({
      host: TAILNET_HOST,
      'tailscale-user-login': 'alice@github',
      'x-forwarded-for': '100.64.0.7',
    });
    expect(tailnet.status).toBe(200);
    expect(decode(await tailnet.text())).toContain(
      `"redirect_url":"https://${TAILNET_HOST}/api/github/manifest/callback"`,
    );
  });

  it('écrit ses pages dans la langue de la PWA, retenue pour le retour de GitHub', async () => {
    const setup = await h.app.request('/api/github/setup?lang=en', { headers: NAV });
    const page = await setup.text();
    expect(page).toContain('<html lang="en">');
    expect(page).toContain('Create the factory-live GitHub App');
    expect(page).toContain('Continue on GitHub');
    const cookie = setup.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^factory-live-lang=en;/);
    expect(cookie).toContain('Path=/api/github');
    expect(cookie).toContain('SameSite=Lax');

    // GitHub ramène Clément sans `lang` : la langue retenue vaut pour la page d'échec.
    const back = await h.app.request('/api/github/manifest/callback?code=abc&state=inconnu', {
      headers: { ...NAV, cookie: 'factory-live-lang=en' },
    });
    expect(back.status).toBe(400);
    const failure = await back.text();
    expect(failure).toContain('Unknown or expired creation request: start the App creation again');
    expect(failure).toContain('Back to factory-live');

    const login = await h.app.request('/api/github/login?lang=fr', { headers: NAV });
    expect(login.status).toBe(409);
    expect(login.headers.get('set-cookie')).toMatch(/^factory-live-lang=fr;/);
    expect(await login.text()).toContain('L’App GitHub n’existe pas encore : crée-la d’abord');

    // App créée : la connexion part vers GitHub en retenant la langue pour la page du retour.
    await createAndConnect();
    const toGitHub = await h.app.request('/api/github/login?lang=en', { headers: NAV });
    expect(toGitHub.status).toBe(303);
    expect(toGitHub.headers.get('location')).toMatch(/\/login\/oauth\/authorize\?/);
    expect(toGitHub.headers.get('set-cookie')).toMatch(/^factory-live-lang=en;/);
  });

  it('suit la langue du navigateur quand la PWA n’en dit rien', async () => {
    const english = await h.app.request('/api/github/setup', {
      headers: { ...NAV, 'accept-language': 'de-DE,de;q=0.9,en;q=0.8' },
    });
    expect(await english.text()).toContain('Create the factory-live GitHub App');
    const french = await h.app.request('/api/github/setup', {
      headers: { ...NAV, 'accept-language': 'fr-FR,fr;q=0.9' },
    });
    expect(await french.text()).toContain('Créer l’App GitHub de factory-live');
    const refused = await h.app.request('/api/github/setup', {
      headers: { host: TAILNET_HOST, 'accept-language': 'en-US' },
    });
    expect(refused.status).toBe(403);
    expect(await refused.text()).toBe('Restricted to this PC and your Tailscale login.');
  });

  it('explique un refus sur GitHub sans recopier son texte en HTML', async () => {
    const response = await h.app.request(
      `/api/github/oauth/callback?error=access_denied&error_description=${encodeURIComponent('<b>non</b>')}`,
      { headers: NAV },
    );
    expect(response.status).toBe(400);
    const page = await response.text();
    expect(page).toContain('Connexion refusée sur GitHub : &#60;b&#62;non&#60;/b&#62;');
    expect(page).not.toContain('<b>');
  });

  it('se déconnecte par une écriture protégée', async () => {
    await createAndConnect();
    const logout = (headers: Record<string, string>) =>
      h.app.request('/api/github/logout', { method: 'POST', headers });
    expect((await logout({ ...LOCAL, 'x-factory-live': '' })).status).toBe(403);
    expect((await logout(LOCAL)).status).toBe(204);
    expect((await status()).user).toBeNull();
  });
});

describe('journal du front', () => {
  const log = (headers: Record<string, string> = {}) =>
    h.app.request('/api/client-logs', {
      method: 'POST',
      headers: { ...THIS_PC, origin: 'http://localhost:8446', ...headers },
      body: JSON.stringify({
        level: 'error',
        message: 'TypeError: x is undefined',
        stack: null,
        url: 'http://localhost:8446/settings',
        userAgent: 'test',
        at: new Date(NOW).toISOString(),
      }),
    });

  it('consigne une erreur du front, mais pas venue d’une origine étrangère', async () => {
    expect((await log()).status).toBe(204);
    expect(await refusal(await log({ origin: 'https://evil.example' }))).toEqual([
      403,
      'origin_refused',
    ]);
  });

  it('limite le débit, tous appareils confondus : 60 envois par minute au plus', async () => {
    for (let sent = 0; sent < 60; sent += 1) expect((await log()).status).toBe(204);
    expect(await refusal(await log())).toEqual([429, 'rate_limited']);
    expect(await refusal(await log({ origin: 'https://machine.tailnet.ts.net:8446' }))).toEqual([
      429,
      'rate_limited',
    ]);
    h.clock.now += 60_000;
    expect((await log()).status).toBe(204);
  });
});

describe('documentation', () => {
  it('publie l’OpenAPI 3.1 des routes', async () => {
    const doc = (await (await h.app.request('/api/openapi.json', { headers: THIS_PC })).json()) as {
      openapi: string;
      paths: Record<string, unknown>;
    };
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        '/api/snapshot',
        '/api/issues/{repo}/{number}',
        '/api/interventions/{id}/unblock',
      ]),
    );
  });
});

describe('diagnostic des blocages', () => {
  const CARD = 't_1a9f0049';
  const coder = () => join(h.dir.path, 'hermes', 'profiles', 'coder');
  const CONFIG =
    'model:\n  default: auto\n  provider: freellmapi\nplugins:\n  enabled: [coder-guard]\n';

  /**
   * Le run bloqué de cv-site#49 refait sur le modèle de factory-live#2 : son `git commit` est refusé par
   * Hermès, qui a coupé le hook de coder-guard à 30 s. Config sans délai de hook, réglée avant l'incident.
   */
  function hookTimeoutIncident() {
    const db = new DatabaseSync(join(coder(), 'state.db'));
    db.exec(schemaFor('state', ['system_prompts', 'sessions', 'messages', 'session_model_usage']));
    const sid = '20261028_163000_abcdef';
    db.prepare(
      "INSERT INTO sessions (id, source, profile_name, model, started_at) VALUES (?, 'kanban', 'coder', 'auto', ?)",
    ).run(sid, NOW_S - 4_998);
    const message = db.prepare(
      'INSERT INTO messages (session_id, role, content, tool_call_id, tool_calls, tool_name, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    message.run(sid, 'user', `work kanban task ${CARD}`, null, null, null, NOW_S - 4_998);
    const commit = { command: 'git commit -m "feat: page projets"' };
    message.run(
      sid,
      'assistant',
      null,
      null,
      JSON.stringify([
        {
          id: 'c1',
          type: 'function',
          function: { name: 'terminal', arguments: JSON.stringify(commit) },
        },
      ]),
      null,
      NOW_S - 1_000,
    );
    message.run(
      sid,
      'tool',
      JSON.stringify({ error: HOOK_TIMEOUT_MESSAGE }),
      'c1',
      null,
      'terminal',
      NOW_S - 969,
    );
    db.close();
    mkdirSync(join(coder(), 'plugins', 'coder-guard'), { recursive: true });
    writeFileSync(
      join(coder(), 'plugins', 'coder-guard', '__init__.py'),
      'def register(ctx):\n    ctx.register_hook("pre_tool_call", pre_tool)\n',
    );
    writeConfig(CONFIG, NOW_S - 86_400);
    h.hub.refreshDiagnoses();
  }

  function writeConfig(yaml: string, mtime: number) {
    writeFileSync(join(coder(), 'config.yaml'), yaml);
    utimesSync(join(coder(), 'config.yaml'), mtime, mtime);
  }

  const unblock = (id: string, body: Record<string, unknown>) =>
    h.app.request(`/api/interventions/${encodeURIComponent(id)}/unblock`, {
      method: 'POST',
      headers: LOCAL,
      body: JSON.stringify(body),
    });

  it('dit la cause, qui agit et si débloquer suffit, sans réseau ni modèle', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const before = h.github.calls.length;
    hookTimeoutIncident();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(h.github.calls).toHaveLength(before);
    fetchSpy.mockRestore();
    const [intervention] = (await snapshot()).interventions;
    expect(intervention?.diagnosis?.primary).toMatchObject({
      code: 'guard_hook_timeout',
      actor: 'you_factory',
      cause: { state: 'present' },
      subject: { plugin: 'coder-guard' },
    });
    expect(intervention?.diagnosis?.unblock.when).toBe('after_fix');
    expect(intervention?.diagnosis?.sources).toMatchObject({ transcript: true, config: true });
  });

  it('confirme par le journal d’Hermès, à l’heure de Paris, quel hook a été coupé', async () => {
    hookTimeoutIncident();
    expect((await snapshot()).interventions[0]?.diagnosis?.sources.agentLog).toBe(false);
    // 17:43:51 UTC, 18:43:51 à Paris : la ligne du dépassement, 30 s après le `git commit`.
    mkdirSync(join(coder(), 'logs'), { recursive: true });
    writeFileSync(
      join(coder(), 'logs', 'agent.log'),
      "2026-10-28 18:43:51,000 WARNING [20261028_163000_abcdef] hermes_cli.plugins: Hook 'pre_tool_call' callback pre_tool timed out after 30s \u2014 skipping\n",
    );
    h.clock.now = NOW + 16_000;
    h.hub.refreshDiagnoses();
    const primary = (await snapshot()).interventions[0]?.diagnosis?.primary;
    expect(primary).toMatchObject({ code: 'guard_hook_timeout', confidence: 'certain' });
    expect(primary?.evidence.find((item) => item.source === 'agent_log')).toMatchObject({
      at: new Date((NOW_S - 969) * 1000).toISOString(),
    });
  });

  it('refuse de débloquer tant que la cause est là, sauf à le vouloir', async () => {
    hookTimeoutIncident();
    const id = (await snapshot()).interventions[0]?.id as string;
    expect(await refusal(await unblock(id, { text: 'Reprends' }))).toEqual([409, 'cause_present']);
    expect(h.github.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    const forced = await unblock(id, { text: 'Reprends', acknowledgeCause: true });
    expect(forced.status).toBe(200);
    expect(h.github.calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  });

  it('voit la correction de la config en direct, et laisse alors débloquer', async () => {
    hookTimeoutIncident();
    writeConfig(`${CONFIG}  hook_callback_timeout: 600\n`, NOW_S - 300);
    h.hub.refreshDiagnoses();
    const [intervention] = (await snapshot()).interventions;
    expect(intervention?.diagnosis?.primary.cause).toMatchObject({ state: 'fixed' });
    expect(intervention?.diagnosis?.unblock.when).toBe('now');
    expect((await unblock(intervention?.id as string, { text: 'Reprends' })).status).toBe(200);
  });

  it('garde l’intervention débloquée et suit le run suivant, sans la compter', async () => {
    hookTimeoutIncident();
    const id = (await snapshot()).interventions[0]?.id as string;
    insertEvent(h.writer, { taskId: CARD, kind: 'unblocked', createdAt: NOW_S - 100 });
    h.writer.prepare(`UPDATE tasks SET status = 'running' WHERE id = '${CARD}'`).run();
    insertRun(h.writer, {
      taskId: CARD,
      profile: 'coder',
      status: 'running',
      startedAt: NOW_S - 90,
    });
    h.syncKanban();
    const data = await snapshot();
    expect(data.interventions).toEqual([
      expect.objectContaining({
        id,
        resolvedAt: new Date((NOW_S - 100) * 1000).toISOString(),
        followUp: { runId: 3, outcome: null, sameCause: null },
      }),
    ]);
    expect(data.issues.find((issue) => issue.key === 'cv-site#49')?.interventionIds).toEqual([]);
    expect(h.hub.openInterventions).toEqual([]);
    expect(await refusal(await unblock(id, { text: 'Encore' }))).toEqual([
      404,
      'intervention_unknown',
    ]);
    // Une demi-heure plus tard, elle n'est plus suivie.
    h.clock.now = NOW + 31 * 60_000;
    h.hub.tick();
    expect((await snapshot()).interventions).toEqual([]);
  });

  it('donne à la page de l’issue le verdict des runs et les vraies preuves', async () => {
    hookTimeoutIncident();
    const evidence = join(
      h.dir.path,
      'hermes',
      'kanban',
      'boards',
      'factory',
      'workspaces',
      CARD,
      'evidence',
    );
    mkdirSync(evidence, { recursive: true });
    writeFileSync(join(evidence, '01-test-fails-on-base.txt'), 'FAIL');
    const detail = IssueDetail.parse(
      await (await h.app.request('/api/issues/cv-site/49', { headers: THIS_PC })).json(),
    );
    const card = detail.cards.find((item) => item.id === CARD);
    expect(card?.runs.at(-1)?.verdict).toMatchObject({ finding: 'guard_hook_timeout' });
    expect(card?.evidence.map((file) => [file.name, file.bytes])).toEqual([
      ['01-test-fails-on-base.txt', 4],
    ]);
    expect(detail.cards.find((item) => item.id === 't_b1ef0049')?.blockKind).toBeNull();
  });
});

describe('délais des gardes', () => {
  const coder = () => join(h.dir.path, 'hermes', 'profiles', 'coder');

  /** coder-guard tel qu'il est dans la factory : ses contrôles peuvent durer 900 s, son hook en a 30. */
  function coderGuard() {
    mkdirSync(join(coder(), 'plugins', 'coder-guard'), { recursive: true });
    writeFileSync(
      join(coder(), 'plugins', 'coder-guard', '__init__.py'),
      [
        'def _run(cmd: str, cwd: Path, timeout: int = 900) -> tuple[int, str]:',
        '    r = subprocess.run(["bash", "-lc", cmd], cwd=cwd, timeout=timeout)',
        'def register(ctx):',
        '    ctx.register_hook("pre_tool_call", pre_tool)',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(coder(), 'config.yaml'),
      'model:\n  default: auto\n  provider: freellmapi\nplugins:\n  enabled: [coder-guard]\n',
    );
    mkdirSync(join(coder(), 'logs'), { recursive: true });
    writeFileSync(
      join(coder(), 'logs', 'agent.log'),
      "2026-10-28 18:43:51,000 WARNING [20261028_163000_abcdef] hermes_cli.plugins: Hook 'pre_tool_call' callback pre_tool timed out after 30s \\u2014 skipping\n",
    );
  }

  it('signale la garde qui peut dépasser son hook, dans la santé et sur l’écran Agents', async () => {
    coderGuard();
    h.hub.refreshDiagnoses();
    const guards = (await snapshot()).health.find((item) => item.id === 'guards');
    expect(guards).toMatchObject({
      status: 'degraded',
      detail: msg('health.guards.risk', { count: 1 }),
      metrics: [
        {
          label: msg('health.guards.riskItem', { profile: 'coder', plugin: 'coder-guard' }),
          value: msg('health.guards.limits', { longest: 900, limit: 30 }),
        },
      ],
    });
    const profiles = (await (
      await h.app.request('/api/profiles', { headers: THIS_PC })
    ).json()) as {
      name: string;
      plugins: { name: string; timeouts: number; longestSeconds: number | null }[];
    }[];
    expect(profiles.find((profile) => profile.name === 'coder')?.plugins).toEqual([
      expect.objectContaining({ name: 'coder-guard', timeouts: 1, longestSeconds: 900 }),
    ]);
  });

  it('suit en direct la config et le code de la garde', async () => {
    coderGuard();
    h.hub.refreshDiagnoses();
    const guards = async () => (await snapshot()).health.find((item) => item.id === 'guards');
    // 600 s, le maximum d'Hermès : le plafond des outils (420 s) coupe encore avant les 900 s.
    const config = join(coder(), 'config.yaml');
    writeFileSync(
      config,
      'model:\n  default: auto\n  provider: freellmapi\nplugins:\n  enabled: [coder-guard]\n  hook_callback_timeout: 600\n',
    );
    utimesSync(config, new Date(), new Date(Date.now() + 5_000));
    h.hub.refreshDiagnoses();
    expect((await guards())?.metrics).toEqual([
      expect.objectContaining({ value: msg('health.guards.limits', { longest: 900, limit: 420 }) }),
    ]);
    // La garde ne lance plus rien de plus long que 300 s : plus de risque.
    const plugin = join(coder(), 'plugins', 'coder-guard', '__init__.py');
    writeFileSync(
      plugin,
      'def register(ctx):\n    ctx.register_hook("pre_tool_call", pre_tool)\nrun(timeout=300)\n',
    );
    utimesSync(plugin, new Date(), new Date(Date.now() + 10_000));
    h.hub.refreshDiagnoses();
    expect(await guards()).toMatchObject({ status: 'ok', detail: msg('health.guards.ok') });
  });
});

describe('erreurs d’API classées par Hermès', () => {
  it('compte une limite de débit d’après le type d’erreur, même sans code 429', async () => {
    const error = (extra: Record<string, unknown>) =>
      postHook(
        hook('api_request_error', {
          extra: { model: 'nemotron-3-ultra', provider: 'nvidia', ...extra },
        }),
      );
    expect(
      (await error({ error: { type: 'rate_limit', message: 'Too many requests' } })).status,
    ).toBe(202);
    expect(
      (await error({ error: { type: 'server_error', message: 'Bad gateway' }, status_code: 502 }))
        .status,
    ).toBe(202);
    h.hub.flush();
    const nvidia = (await snapshot()).health.find((item) => item.id === 'provider:nvidia');
    expect(nvidia?.metrics).toEqual([{ label: msg('health.metric.rateLimited'), value: '1' }]);
  });
});
