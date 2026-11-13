import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A fake workflow-core for the tests (#57): a small local HTTP server that serves the routes factory-live
 * reads, answers written by the test in the core's format, and an SSE stream the test feeds.
 */

export interface FakeCoreState {
  workflows: {
    key: string;
    board: string;
    sheet_valid: boolean;
    gestures?: { name: string; kind: 'comment' | 'issue'; repo?: string }[];
  }[];
  /**
   * The sheet of each workflow, as the core serves it; absent: 503 sheet_unavailable; an `{ invalid }`:
   * the core refuses it (422 invalid_sheet, `invalid` its reason).
   */
  sheets: Record<string, unknown>;
  items: Record<string, unknown[]>;
  /** The cursor the read routes carry; `null`: none (the stream does not run). */
  cursor: string | null;
  /** The live state of each workflow's agents (#66); absent: none. */
  live?: Record<string, unknown[]>;
  /** The recent facts of each workflow's activity, oldest first (#66); absent: none. */
  activity?: Record<string, unknown[]>;
  /** The state of the machine, as /api/machine serves it without `schema_version` (#62); absent: none. */
  machine?: unknown;
  /** The usage of each workflow, by the `days` asked (#66); absent: 404. */
  usage?: Record<string, (days: number) => unknown>;
  /**
   * The declared data of each workflow, by `<subject>:<id>` (#60): the `data` list of the answer. Absent: the
   * core declares nothing for it (an empty list); `invalid_id`: the core refuses the id (422).
   */
  data?: Record<string, Record<string, unknown[] | 'invalid_id'>>;
  /** The open interventions of each workflow, by opening time (#59); absent: none. */
  interventions?: Record<string, unknown[]>;
  /** The diagnoses of each workflow, `{item, trigger, diagnosis}` (#59); absent: none. */
  diagnoses?: Record<string, unknown[]>;
  /** The run verdicts of each card, by card id (#59); absent: none. */
  verdicts?: Record<string, unknown[]>;
  /** The agents of each workflow, `{kanban, agents}` (#93); absent: 404. */
  agents?: Record<string, unknown>;
  /** The delay of each next `/agents` answer, in ms, in the order of the requests (#93). */
  agentsDelays?: number[];
}

export interface FakeCoreRequest {
  path: string;
  auth: string | null;
  lastEventId: string | null;
}

export interface FakeCore {
  url: string;
  state: FakeCoreState;
  requests: FakeCoreRequest[];
  /** Events sent first to a stream opened with this `Last-Event-ID` (null: without one). */
  backlog: (lastEventId: string | null) => object[];
  /** Sends one event to every open stream; returns the number of streams it reached. */
  send(event: { cursor: string; kind: string } & Record<string, unknown>): number;
  /** How long the core waits before answering a path (#59: a slow route); none by default. */
  delay: (path: string) => number;
  /** Cuts every open stream, as a restart of the core would. */
  cut(): void;
  /** Ends every open stream normally, as a proxy that closes long requests would. */
  finish(): void;
  openStreams(): number;
  /** Stops answering: the port closes. */
  close(): Promise<void>;
}

const frame = (event: { cursor: string; kind: string }) =>
  `id: ${event.cursor}\nevent: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`;

export async function fakeCore(secret: string, state: FakeCoreState): Promise<FakeCore> {
  const streams = new Set<ServerResponse>();
  const requests: FakeCoreRequest[] = [];
  const core: Omit<FakeCore, 'url'> & { url: string } = {
    url: '',
    state,
    requests,
    backlog: () => [],
    delay: () => 0,
    send(event) {
      for (const stream of streams) stream.write(frame(event));
      return streams.size;
    },
    cut() {
      for (const stream of streams) stream.destroy();
      streams.clear();
    },
    finish() {
      for (const stream of streams) stream.end();
      streams.clear();
    },
    openStreams: () => streams.size,
    close: () =>
      new Promise<void>((resolve) => {
        core.cut();
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };

  const json = (response: ServerResponse, status: number, body: unknown) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  const withCursor = (body: Record<string, unknown>) =>
    state.cursor === null ? body : { ...body, cursor: state.cursor };

  const handle = (request: IncomingMessage, response: ServerResponse) => {
    const path = new URL(request.url ?? '/', 'http://core').pathname;
    const lastEventId = request.headers['last-event-id'];
    requests.push({
      path,
      auth: request.headers.authorization ?? null,
      lastEventId: typeof lastEventId === 'string' ? lastEventId : null,
    });
    if (request.headers.authorization !== `Bearer ${secret}`)
      return json(response, 401, { error: 'unauthorized', detail: 'missing or wrong secret' });
    if (path === '/api/machine')
      return json(
        response,
        200,
        withCursor({
          schema_version: 1,
          ...((state.machine as object | undefined) ?? {
            runtime_version: null,
            contract: null,
            mode: 'normal',
            boards: {},
          }),
        }),
      );
    if (path === '/api/workflows')
      return json(response, 200, withCursor({ schema_version: 1, workflows: state.workflows }));
    if (path === '/api/events') {
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      response.flushHeaders();
      streams.add(response);
      request.on('close', () => streams.delete(response));
      const resume = typeof lastEventId === 'string' ? lastEventId : null;
      for (const event of core.backlog(resume))
        response.write(frame(event as { cursor: string; kind: string }));
      return;
    }
    const verdicts = /^\/api\/workflows\/([\w-]+)\/items\/([\w-]+)\/run-verdicts$/.exec(path);
    if (verdicts)
      return json(response, 200, {
        schema_version: 1,
        verdicts: state.verdicts?.[verdicts[2] ?? ''] ?? [],
      });
    const route =
      /^\/api\/workflows\/([\w-]+)\/(sheet|items|live|activity|usage|interventions|diagnoses|data|agents)$/.exec(
        path,
      );
    const key = route?.[1];
    if (!route || !key || !state.workflows.some((workflow) => workflow.key === key))
      return json(response, 404, { error: 'unknown_workflow', detail: `workflow "${key}"` });
    if (route[2] === 'agents') {
      // The answer is taken when the request arrives, then sent after its delay, if any.
      const agents = state.agents?.[key];
      const answer = () =>
        agents
          ? json(response, 200, { schema_version: 1, workflow: key, ...agents })
          : json(response, 404, { error: 'not_found', detail: 'no agents' });
      const delay = state.agentsDelays?.shift() ?? 0;
      if (delay > 0) setTimeout(answer, delay);
      else answer();
      return;
    }
    if (route[2] === 'interventions')
      return json(response, 200, {
        schema_version: 1,
        workflow: key,
        interventions: state.interventions?.[key] ?? [],
      });
    if (route[2] === 'diagnoses')
      return json(response, 200, {
        schema_version: 1,
        workflow: key,
        diagnoses: state.diagnoses?.[key] ?? [],
      });
    if (route[2] === 'live')
      return json(response, 200, {
        schema_version: 1,
        workflow: key,
        agents: state.live?.[key] ?? [],
      });
    if (route[2] === 'activity')
      return json(response, 200, {
        schema_version: 1,
        workflow: key,
        facts: state.activity?.[key] ?? [],
      });
    if (route[2] === 'data') {
      const query = new URL(request.url ?? '/', 'http://core').searchParams;
      const subject = query.get('subject') ?? '';
      const id = query.get('id') ?? '';
      const data = state.data?.[key]?.[`${subject}:${id}`] ?? [];
      return data === 'invalid_id'
        ? json(response, 422, { error: 'invalid_id', detail: `id "${id}"` })
        : json(response, 200, { schema_version: 1, workflow: key, subject, id, data });
    }
    if (route[2] === 'usage') {
      const usage = state.usage?.[key];
      const days = Number(new URL(request.url ?? '/', 'http://core').searchParams.get('days') ?? 7);
      return usage
        ? json(response, 200, { schema_version: 1, workflow: key, ...(usage(days) as object) })
        : json(response, 404, { error: 'not_found', detail: 'no usage' });
    }
    if (route[2] === 'sheet') {
      const sheet = state.sheets[key] as { invalid?: string } | undefined;
      if (sheet?.invalid !== undefined)
        return json(response, 422, { error: 'invalid_sheet', detail: sheet.invalid });
      return key in state.sheets
        ? json(response, 200, { schema_version: 1, workflow: key, sheet: state.sheets[key] })
        : json(response, 503, { error: 'sheet_unavailable', detail: 'no sheet' });
    }
    return json(
      response,
      200,
      withCursor({ schema_version: 1, workflow: key, items: state.items[key] ?? [] }),
    );
  };

  const server: Server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://core').pathname;
    const wait = core.delay(path);
    if (wait > 0) setTimeout(() => handle(request, response), wait);
    else handle(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  core.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return core;
}
