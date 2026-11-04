// Faux serveur d'API de factory-live pour les e2e « live » : un vrai flux SSE (instantané puis
// battements), que les tests coupent (`/__control/down`, réponses 502 comme pendant un redémarrage)
// et rétablissent (`/__control/up`). Seulement ce que les écrans testés lisent.
import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 4182);
let up = true;
const open = new Set();

function snapshot() {
  const now = new Date().toISOString();
  const station = (id, profiles) => ({ id, profiles });
  return {
    generatedAt: now,
    factory: { live: true, paused: false, pauseReason: null, maxInProgress: 2, running: 1 },
    stations: [
      station('intake', []),
      station('brief', ['coordinator']),
      station('implementation', ['coder']),
      station('gate', ['gate']),
      station('release', ['release']),
      station('done', []),
    ],
    agents: [
      {
        profile: 'coder',
        station: 'implementation',
        state: 'tool',
        cardId: 't_c0de0052',
        issueKey: 'cv-site#52',
        model: { model: 'agnes-2.5-flash', provider: 'freellmapi', source: 'live' },
        laneModel: null,
        action: { kind: 'tool', label: 'terminal', detail: 'npm test', startedAt: now },
        runStartedAt: now,
        lastHeartbeatAt: now,
      },
    ],
    issues: [
      {
        key: 'cv-site#52',
        repo: 'cv-site',
        number: 52,
        title: 'Pied de page : liens vers les réseaux',
        url: 'https://github.com/code-my-life/cv-site/issues/52',
        labels: [{ name: 'factory', color: '0e8a16' }],
        station: 'implementation',
        previousStation: null,
        stationChangedAt: null,
        status: 'active',
        claudeModel: null,
        harness: 'coder',
        pr: null,
        prUrl: null,
        activeProfiles: ['coder'],
        interventionIds: [],
        startedAt: now,
        updatedAt: now,
        // What the server's projection adds to every issue: its type, its proof at the gate, its journey.
        type: null,
        lane: 'failfirst',
        journey: [
          { station: 'intake', lane: null, outcome: null, at: now },
          { station: 'brief', lane: null, outcome: null, at: now },
          { station: 'implementation', lane: null, outcome: null, at: now },
        ],
      },
    ],
    sideCards: [],
    interventions: [],
    activity: [],
    health: [],
    addresses: { local: 'http://localhost:8446', tailnet: 'https://machine.tailnet.ts.net:8446' },
  };
}

/**
 * The recette of a real PR, as the server computes it from GitHub (#22): the head of factory-live#24,
 * its checks, two criteria (one proven, one whose proof fails) and two review threads of Greptile.
 */
function acceptance() {
  const head = '9a72096265a97aab5223e2e1d77bf48411a8c962';
  const run = 'https://github.com/code-my-life/factory-live/actions/runs/41859193780';
  const check = (name, workflow, status, durationMs, job) => ({
    name,
    workflow,
    status,
    durationMs,
    url: `${run}/job/${job}`,
  });
  const thread = (title, resolved, id) => ({
    author: 'greptile-apps',
    severity: 'P2',
    title,
    resolved,
    at: '2026-11-04T14:55:43Z',
    url: `https://github.com/code-my-life/factory-live/pull/24#discussion_r${id}`,
  });
  return {
    pr: 24,
    head,
    base: 'c9fa041a51e2d8aa5c1b0d8e3b1f1e0b2a7d6c5e',
    criteria: [
      {
        id: 'C1',
        text: 'la recette apparaît sous les faits de toute issue qui a une PR.',
        status: 'ok',
        reason: 'proven',
        proof:
          '`AcceptanceBoard.test.tsx` « montre les six widgets, chacun avec son picto de verdict »',
        url: `https://github.com/code-my-life/factory-live/blob/${head}/apps/web/src/features/acceptance/AcceptanceBoard.test.tsx`,
      },
      {
        id: 'C2',
        text: 'axe ne trouve aucune violation WCAG 2.2 AA dans la recette.',
        status: 'nok',
        reason: 'failing',
        proof:
          '`e2e/acceptance.spec.ts` « recette : aucune violation WCAG 2.2 AA (axe) : /issues/factory-live/18 »',
        url: `https://github.com/code-my-life/factory-live/blob/${head}/e2e/acceptance.spec.ts#L41`,
      },
    ],
    checks: [
      check('Vérifications (Node 24.22.1)', 'CI', 'success', 164_000, 126675986039),
      check('Bout en bout (Chromium, WebKit) et captures', 'CI', 'failure', 596_000, 126675985696),
      check('Image Docker', 'CI', 'success', 46_000, 126675985801),
    ],
    gate: null,
    tests: [],
    proofs: [],
    threads: [
      thread('Posted reviews disappear', false, 4469110873),
      thread('Gate rules have no links', true, 4469110935),
    ],
    reviewRounds: 7,
    twins: null,
    twinsAbsent: 'no_build',
  };
}

function json(response, body, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

createServer((request, response) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost');
  if (pathname === '/__control/down') {
    // Comme un serveur qui s'arrête : les flux ouverts se ferment, les requêtes suivantes prennent 502.
    up = false;
    for (const stream of open) stream.end();
    open.clear();
    return json(response, { up });
  }
  if (pathname === '/__control/up') {
    up = true;
    return json(response, { up });
  }
  if (pathname === '/healthz') return json(response, { ok: true });
  if (!up) return json(response, { error: 'Conteneur en redémarrage' }, 502);
  if (pathname === '/api/stream') {
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    response.write('retry: 500\n\n');
    response.write(
      `id: 1\nevent: snapshot\ndata: ${JSON.stringify({ type: 'snapshot', snapshot: snapshot() })}\n\n`,
    );
    const ping = setInterval(() => response.write('event: ping\ndata: {}\n\n'), 1_000);
    open.add(response);
    request.on('close', () => {
      clearInterval(ping);
      open.delete(response);
    });
    return undefined;
  }
  if (pathname === '/api/issues/cv-site/52')
    return json(response, {
      issue: snapshot().issues[0],
      cards: [],
      timeline: [],
      tokens: 0,
      costUsd: 0,
      acceptance: acceptance(),
    });
  if (pathname === '/api/preferences/acceptance-layout') {
    const device = new URL(request.url ?? '/', 'http://localhost').searchParams.get('device');
    if (request.method === 'PUT') {
      let body = '';
      request.on('data', (chunk) => (body += chunk));
      request.on('end', () =>
        json(response, { device, layout: JSON.parse(body), updatedAt: new Date().toISOString() }),
      );
      return undefined;
    }
    return json(response, { device, layout: null, updatedAt: null });
  }
  if (pathname === '/api/github/status')
    return json(response, {
      mode: 'none',
      app: null,
      user: null,
      setupUrl: '/api/github/setup',
      loginUrl: '/api/github/login',
    });
  return json(response, { error: 'Route inconnue' }, 404);
}).listen(port, '127.0.0.1');
