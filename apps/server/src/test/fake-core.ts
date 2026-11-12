import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A fake workflow-core for the tests (#57): a small local HTTP server that serves the routes factory-live
 * reads, answers written by the test in the core's format, and an SSE stream the test feeds.
 */

export interface FakeCoreState {
  workflows: { key: string; board: string; sheet_valid: boolean }[];
  /** The sheet of each workflow, as the core serves it; absent: 503 sheet_unavailable. */
  sheets: Record<string, unknown>;
  items: Record<string, unknown[]>;
  /** The cursor the read routes carry; `null`: none (the stream does not run). */
  cursor: string | null;
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
    const route = /^\/api\/workflows\/([\w-]+)\/(sheet|items)$/.exec(path);
    const key = route?.[1];
    if (!route || !key || !state.workflows.some((workflow) => workflow.key === key))
      return json(response, 404, { error: 'unknown_workflow', detail: `workflow "${key}"` });
    if (route[2] === 'sheet')
      return key in state.sheets
        ? json(response, 200, { schema_version: 1, workflow: key, sheet: state.sheets[key] })
        : json(response, 503, { error: 'sheet_unavailable', detail: 'no sheet' });
    return json(
      response,
      200,
      withCursor({ schema_version: 1, workflow: key, items: state.items[key] ?? [] }),
    );
  };

  const server: Server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  core.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return core;
}
