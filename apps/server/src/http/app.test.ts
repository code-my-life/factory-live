import { GitHubAccess, IssueDetail, Snapshot, StreamEvent } from '@factory-live/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { trackUnblockReactions } from '../application/unblock.ts';
import { sign } from '../ingest/signature.ts';
import { NOW, NOW_S, ORIGINS, SECRET, harness } from '../test/harness.ts';
import type { Harness } from '../test/harness.ts';
import { insertEvent } from '../test/hermes-fixtures.ts';

let h: Harness;

beforeEach(() => {
  h = harness();
});

afterEach(() => {
  h.close();
});

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
    cwd: '/home/cleme/.hermes/kanban/boards/factory/workspaces/t_1a9f0049',
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
    headers: { 'content-type': 'application/json', 'x-hermes-signature-256': sign(raw, secret) },
  });
}

const LOCAL = {
  host: 'localhost:8446',
  origin: 'http://localhost:8446',
  'x-factory-live': '1',
  'content-type': 'application/json',
};
const TAILNET = {
  host: 'desktop-gja56n4.tail40220c.ts.net:8446',
  origin: 'https://desktop-gja56n4.tail40220c.ts.net:8446',
  'x-factory-live': '1',
  'content-type': 'application/json',
};

async function snapshot() {
  return Snapshot.parse(await (await h.app.request('/api/snapshot')).json());
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
      headers: { 'x-factory-live-signature-256': sign(report, SECRET) },
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
    expect((await post({ ...LOCAL, 'x-factory-live': '' })).status).toBe(403);
    expect((await post({ ...LOCAL, origin: 'https://evil.example' })).status).toBe(403);
    expect((await post({ ...TAILNET })).status).toBe(403);
    expect((await post({ ...TAILNET, 'tailscale-user-login': 'intrus@github' })).status).toBe(403);
    expect((await post({ ...LOCAL, 'x-forwarded-for': '100.64.0.7' })).status).toBe(403);
    expect(h.github.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    expect((await post({ ...TAILNET, 'tailscale-user-login': 'cddev@github' })).status).toBe(200);
  });

  it('refuse une réponse vide et une intervention inconnue', async () => {
    const id = encodeURIComponent(await interventionId());
    expect(
      (
        await h.app.request(`/api/interventions/${id}/unblock`, {
          method: 'POST',
          headers: LOCAL,
          body: JSON.stringify({ text: '   ' }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await h.app.request('/api/interventions/inconnue/unblock', {
          method: 'POST',
          headers: LOCAL,
          body: JSON.stringify({ text: 'ok' }),
        })
      ).status,
    ).toBe(404);
  });
});

describe('détail d’une issue', () => {
  it('respecte le contrat : cartes, runs, timeline', async () => {
    const response = await h.app.request('/api/issues/cv-site/49');
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
    expect(detail.timeline.map((entry) => entry.label)).toContain(
      'Carte bloquée : décision attendue',
    );
    expect((await h.app.request('/api/issues/cv-site/50')).status).toBe(404);
    expect((await h.app.request('/api/issues/..%2Fetc/1')).status).toBe(400);
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
    const response = await h.app.request('/api/stream');
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

  it('reprend après une coupure sans renvoyer d’instantané', async () => {
    h.hub.flush();
    const lastId = h.buffer.lastId;
    await postHook(hook('pre_tool_call', { tool_name: 'terminal', tool_input: { command: 'ls' } }));
    h.hub.flush();
    const events = await read(
      await h.app.request('/api/stream', { headers: { 'last-event-id': String(lastId) } }),
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
          headers: { ...TAILNET, 'tailscale-user-login': 'cddev@github' },
          body: JSON.stringify(subscription),
        })
      ).status,
    ).toBe(204);
    expect(await (await h.app.request('/api/push/key')).json()).toEqual({ publicKey: 'BPUBLIC' });
    const result = await (
      await h.app.request('/api/push/test', { method: 'POST', headers: LOCAL })
    ).json();
    expect(result).toMatchObject({ sent: 1 });
    expect(JSON.parse(h.pushes[0]?.payload ?? '{}')).toMatchObject({
      title: 'factory-live : test',
    });
  });
});

describe('GitHub App et connexion de Clément', () => {
  const NAV = { host: 'localhost:8446' };
  const TAILNET_HOST = 'desktop-gja56n4.tail40220c.ts.net:8446';
  const decode = (html: string) =>
    html.replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
  const status = async () =>
    GitHubAccess.parse(await (await h.app.request('/api/github/status')).json());
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
    h.github.reactions.push({ content: '+1', user: { login: 'factory-bot' } });
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
    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: string }).error).toMatch(/Connecte-toi/);
    expect(h.github.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
  });

  it('réserve ces pages à ce PC et au login Tailscale de Clément', async () => {
    const get = (headers: Record<string, string>) =>
      h.app.request('/api/github/setup', { headers });
    expect((await get({})).status).toBe(403);
    expect((await get({ host: 'evil.example' })).status).toBe(403);
    expect((await get({ ...NAV, 'x-forwarded-for': '100.64.0.7' })).status).toBe(403);
    expect(
      (await get({ host: TAILNET_HOST, 'tailscale-user-login': 'intrus@github' })).status,
    ).toBe(403);
    const tailnet = await get({
      host: TAILNET_HOST,
      'tailscale-user-login': 'cddev@github',
      'x-forwarded-for': '100.64.0.7',
    });
    expect(tailnet.status).toBe(200);
    expect(decode(await tailnet.text())).toContain(
      `"redirect_url":"https://${TAILNET_HOST}/api/github/manifest/callback"`,
    );
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

describe('documentation', () => {
  it('publie l’OpenAPI 3.1 des routes', async () => {
    const doc = (await (await h.app.request('/api/openapi.json')).json()) as {
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
