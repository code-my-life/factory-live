// A fake workflow-core for the « live » e2e (#67): the routes and the SSE stream that factory-live's
// server reads when LIVE_SOURCE=workflow-core, behind a test secret, on the scenario of
// fake-core-scenario.mjs; and the GitHub that factory-live's screens read (issue, PR, comment of a
// gesture), under /github. Every answer of the core is checked against the core's JSON Schema copied in
// packages/contracts: a scenario that drifts from the real core fails its test instead of passing.
//
// Control routes for the tests:
// - POST /__control/down, /__control/up: the core stops answering (its streams cut, 502) or comes back;
// - POST /__control/change {workflow?, id, patch}: a card changes, announced on the stream;
// - POST /__control/reset {state: 'initial'|'after'}: a new epoch with that state, announced by `reset`;
// - GET /__control/comments: the comments factory-live posted on GitHub;
// - GET /__control/intervention: the id of cv-site#49's intervention in the current state;
// - GET /__control/healthz: the fake core is up (Playwright waits for it), whether it answers or not.
import { readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { z } from 'zod';
import * as scenario from './fake-core-scenario.mjs';

const port = Number(process.env.PORT ?? 4182);

// --- The core's JSON Schema, from the copies factory-live keeps --------------------------------------
const SCHEMA_DIR = new URL('../packages/contracts/src/workflow-core/schema/', import.meta.url);
const checks = Object.fromEntries(
  readdirSync(SCHEMA_DIR)
    .filter((name) => name.endsWith('.schema.json'))
    .map((name) => [
      name.replace('.schema.json', ''),
      z.fromJSONSchema(JSON.parse(readFileSync(new URL(name, SCHEMA_DIR), 'utf8'))),
    ]),
);
/** An answer of the core, refused here when out of its schema: the scenario must stay the core's. */
function checked(schema, body) {
  const result = checks[schema]?.safeParse(body);
  if (!result?.success)
    throw new Error(`fake core: answer out of ${schema}.schema.json: ${result?.error?.message}`);
  return body;
}

// --- State ----------------------------------------------------------------------------------------------
let up = true;
let epoch = 0;
let last = 0;
/** The events of the epoch, for a client resuming from a cursor. */
let journal = [];
let items = {};
/** The number of the scenario's loads: the event of cv-site#49's block, hence its intervention's id. */
let generation = 0;
const streams = new Set();
const comments = [];
const now = () => Math.floor(Date.now() / 1000);

function load(state) {
  const at = now();
  generation += 1;
  items = {
    factory: new Map(
      scenario.factoryItems(at, state === 'after', generation).map((item) => [item.id, item]),
    ),
    essai: new Map(scenario.essaiItems(at).map((item) => [item.id, item])),
  };
  epoch = at * 1000 + Math.floor(Math.random() * 1000);
  last = 0;
  journal = [];
}
load('initial');

const cursor = () => `${epoch}:${last}`;

function frame(event) {
  return `id: ${event.cursor}\nevent: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`;
}

function announce(kind, workflow, item, state) {
  last += 1;
  const event = checked('event', {
    cursor: cursor(),
    workflow,
    item,
    kind,
    at: new Date().toISOString(),
    state,
  });
  journal.push(event);
  for (const stream of streams) stream.write(frame(event));
  return event;
}

// --- HTTP -----------------------------------------------------------------------------------------------
function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function body(request) {
  return new Promise((resolve) => {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => resolve(raw ? JSON.parse(raw) : {}));
  });
}

const GESTURES = { factory: [{ name: 'unblock', kind: 'comment' }], essai: [] };
const SHEETS = { factory: scenario.CODE_SHEET, essai: scenario.ESSAI_SHEET };

function core(request, response, url) {
  if (!up) return json(response, 502, { error: 'unavailable', detail: 'core stopped' });
  if (request.headers.authorization !== `Bearer ${scenario.SECRET}`)
    return json(response, 401, checked('error', { error: 'unauthorized', detail: 'wrong secret' }));
  const path = url.pathname;
  const params = url.searchParams;
  const at = now();
  if (path === '/healthz') return json(response, 200, { status: 'ok' });
  if (path === '/api/machine')
    return json(
      response,
      200,
      checked('machine', { schema_version: 1, cursor: cursor(), ...scenario.machine(at) }),
    );
  if (path === '/api/workflows')
    return json(
      response,
      200,
      checked('workflows', {
        schema_version: 1,
        cursor: cursor(),
        workflows: Object.keys(items).map((key) => ({
          key,
          board: key,
          sheet_valid: true,
          gestures: GESTURES[key],
        })),
      }),
    );
  if (path === '/api/events') {
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    response.flushHeaders();
    streams.add(response);
    request.on('close', () => streams.delete(response));
    const resume = request.headers['last-event-id'];
    if (typeof resume === 'string') {
      const [e, n] = resume.split(':').map(Number);
      // A cursor of another epoch: the client reads the full state again.
      if (e !== epoch)
        response.write(
          frame({
            cursor: `${epoch}:0`,
            workflow: null,
            item: null,
            kind: 'reset',
            at: new Date().toISOString(),
            state: null,
          }),
        );
      else
        for (const event of journal.filter((each) => Number(each.cursor.split(':')[1]) > n))
          response.write(frame(event));
    }
    return undefined;
  }
  const route = /^\/api\/workflows\/([\w-]+)\/(.+)$/.exec(path);
  const key = route?.[1];
  if (!route || !key || !items[key])
    return json(
      response,
      404,
      checked('error', { error: 'unknown_workflow', detail: `workflow "${key}"` }),
    );
  const rest = route[2];
  if (rest === 'sheet')
    return json(
      response,
      200,
      checked('sheet-response', { schema_version: 1, workflow: key, sheet: SHEETS[key] }),
    );
  if (rest === 'items')
    return json(
      response,
      200,
      checked('items', {
        schema_version: 1,
        cursor: cursor(),
        workflow: key,
        items: [...items[key].values()],
      }),
    );
  if (rest === 'data') {
    const subject = params.get('subject') ?? '';
    const id = params.get('id') ?? '';
    return json(
      response,
      200,
      checked('declared-data', {
        schema_version: 1,
        workflow: key,
        subject,
        id,
        data: key === 'factory' ? scenario.declaredData(subject, id) : [],
      }),
    );
  }
  if (key !== 'factory')
    return json(response, 404, checked('error', { error: 'not_found', detail: rest }));
  if (rest === 'live')
    return json(
      response,
      200,
      checked('live', { schema_version: 1, workflow: key, agents: scenario.liveAgents(at) }),
    );
  if (rest === 'activity')
    return json(
      response,
      200,
      checked('activity', { schema_version: 1, workflow: key, facts: [] }),
    );
  if (rest === 'usage')
    return json(
      response,
      200,
      checked('usage', {
        schema_version: 1,
        workflow: key,
        days: Number(params.get('days') ?? 7),
        models: [],
        agents: [],
        daily: [],
        rows: [],
      }),
    );
  if (rest === 'interventions')
    return json(
      response,
      200,
      checked('interventions', {
        schema_version: 1,
        workflow: key,
        interventions: items.factory.has(scenario.BLOCKED_CARD)
          ? scenario.interventions(at, generation)
          : [],
      }),
    );
  if (rest === 'diagnoses') {
    const diagnoses = items.factory.has(scenario.BLOCKED_CARD)
      ? scenario.diagnoses(at, generation)
      : [];
    for (const each of diagnoses) checked('diagnosis', each.diagnosis);
    return json(response, 200, { schema_version: 1, workflow: key, diagnoses });
  }
  if (/^items\/[\w-]+\/run-verdicts$/.test(rest))
    return json(response, 200, checked('run-verdicts', { schema_version: 1, verdicts: [] }));
  if (rest === 'agents') return json(response, 200, checked('agents', scenario.AGENTS));
  return json(response, 404, checked('error', { error: 'not_found', detail: rest }));
}

/** The GitHub that factory-live reads and writes for these screens; the rest answers 404. */
async function github(request, response, path) {
  const repo = '/repos/code-my-life/cv-site';
  const issue = (number, title) => ({
    number,
    title,
    html_url: `https://github.com/code-my-life/cv-site/issues/${number}`,
    labels: [{ name: 'factory', color: '0e8a16' }],
    state: 'open',
    body: '',
  });
  if (path === `${repo}/issues/52`)
    return json(response, 200, issue(52, 'Pied de page : liens vers les réseaux'));
  if (path === `${repo}/issues/49`) return json(response, 200, issue(49, 'Page Projets'));
  if (
    request.method === 'POST' &&
    /^\/repos\/code-my-life\/[\w-]+\/issues\/\d+\/comments$/.test(path)
  ) {
    const posted = await body(request);
    const id = 4_000 + comments.length;
    comments.push({ path, body: posted.body });
    return json(response, 201, {
      id,
      html_url: `https://github.com${path.replace('/repos', '').replace('/comments', '')}#issuecomment-${id}`,
    });
  }
  if (/\/reactions/.test(path)) return json(response, 200, []);
  // The PR of cv-site#52: factory-live#24, with the real answers of GitHub kept in fixtures.
  const pr = `/repos/code-my-life/${scenario.PR.repo}`;
  const fixture = (name) =>
    JSON.parse(
      readFileSync(new URL(`../fixtures/github-acceptance/${name}`, import.meta.url), 'utf8'),
    );
  if (path === `${pr}/pulls/${scenario.PR.number}`)
    return json(response, 200, {
      number: scenario.PR.number,
      html_url: scenario.PR_URL,
      title: 'feat: la recette des PR',
      state: 'open',
      head: { sha: scenario.PR.head },
      base: { sha: scenario.PR.base },
      requested_reviewers: [],
      body: '',
    });
  if (path === `${pr}/pulls/${scenario.PR.number}/reviews`) return json(response, 200, []);
  if (path === `${pr}/actions/runs`) return json(response, 200, fixture('workflow-runs.json'));
  if (path === `${pr}/commits/${scenario.PR.head}/check-runs`)
    return json(response, 200, fixture('check-runs.json'));
  if (path === `${pr}/commits/${scenario.PR.head}/statuses`)
    return json(response, 200, fixture('statuses.json'));
  if (
    path === `${pr}/issues/${scenario.PR.number}/comments` ||
    path === `${pr}/pulls/${scenario.PR.number}/files`
  )
    return json(response, 200, []);
  if (/^\/repos\/code-my-life\/[\w-]+\/actions\/runs\/\d+\/artifacts$/.test(path))
    return json(response, 200, { total_count: 0, artifacts: [] });
  if (path === '/graphql') return json(response, 200, fixture('review-threads.json'));
  if (path === '/user') return json(response, 200, { login: 'cddev', id: 1 });
  return json(response, 404, { message: 'Not Found' });
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const path = url.pathname;
  try {
    if (path === '/__control/down') {
      // As a core that stops: its open streams close, the next requests get 502.
      up = false;
      for (const stream of streams) stream.destroy();
      streams.clear();
      return json(response, 200, { up });
    }
    if (path === '/__control/up') {
      up = true;
      return json(response, 200, { up });
    }
    if (path === '/__control/change') {
      const { workflow = 'factory', id, patch } = await body(request);
      const held = items[workflow]?.get(id);
      if (!held) return json(response, 404, { error: `no item ${id}` });
      const state = { ...held, ...patch };
      checked('items', { schema_version: 1, workflow, items: [state] });
      items[workflow].set(id, state);
      return json(response, 200, announce('changed', workflow, id, state));
    }
    if (path === '/__control/reset') {
      const { state = 'initial' } = await body(request);
      load(state);
      return json(response, 200, announce('reset', null, null, null));
    }
    if (path === '/__control/comments') return json(response, 200, comments);
    if (path === '/__control/intervention')
      return json(response, 200, { id: scenario.interventionId(generation) });
    if (path === '/__control/healthz') return json(response, 200, { ok: true });
    if (path.startsWith('/github/'))
      return await github(request, response, path.slice('/github'.length));
    return core(request, response, url);
  } catch (error) {
    // A broken scenario says so loudly: the server's log and a 500 the test sees.
    console.error(String(error));
    return json(response, 500, { error: 'fake_core', detail: String(error) });
  }
}).listen(port, '127.0.0.1');
