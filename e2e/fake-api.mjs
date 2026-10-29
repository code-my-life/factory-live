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
        labels: ['factory'],
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
      },
    ],
    sideCards: [],
    interventions: [],
    activity: [],
    health: [],
    addresses: { local: 'http://localhost:8446', tailnet: 'https://machine.tailnet.ts.net:8446' },
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
