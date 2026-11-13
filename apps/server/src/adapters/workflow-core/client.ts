import { coreError, coreEvent } from '@factory-live/contracts/workflow-core';
import type { CoreCheck, CoreEvent } from '@factory-live/contracts/workflow-core';

/**
 * workflow-core's HTTP API and SSE stream (ADR 0015, #57), every call behind its shared secret. Each
 * answer and each event goes through the check that `z.fromJSONSchema` builds from the copy of the
 * core's JSON Schema: an answer of another form is an error, never a half-read state.
 */

export class CoreError extends Error {
  /** The core's code and sentence for its refusal (`invalid_sheet`…), when it gave them. */
  readonly code: string | null;
  readonly detail: string | null;

  constructor(message: string, code: string | null = null, detail: string | null = null) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

/** An error's text, for a log line or the reason of a failed read. */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The path of a workflow's route on the core: `/api/workflows/<key>`, then `rest` (`/items`…). */
export function workflowPath(key: string, rest = ''): string {
  return `/api/workflows/${encodeURIComponent(key)}${rest}`;
}

/** The longest a read of the core's API may take. */
const READ_TIMEOUT_MS = 10_000;

/** The kinds of event this copy of the core's schema knows: the others are skipped. */
const KNOWN_KINDS = new Set([
  'changed',
  'reset',
  'live',
  'activity',
  'machine',
  'intervention_opened',
  'intervention_closed',
]);

export class WorkflowCoreClient {
  private readonly url: string;
  private readonly secret: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: { url: string; secret: string; fetch?: typeof fetch }) {
    this.url = options.url.replace(/\/+$/, '');
    this.secret = options.secret;
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${this.secret}`, ...extra };
  }

  /**
   * One read route, its answer checked by its schema. A route without a published schema of its answer
   * (`/diagnoses`) is read with `check` null: the caller checks each part it uses.
   */
  async get<T>(path: string, check: CoreCheck<T>, signal?: AbortSignal): Promise<T>;
  async get(path: string, check: null, signal?: AbortSignal): Promise<unknown>;
  async get<T>(path: string, check: CoreCheck<T> | null, signal?: AbortSignal): Promise<unknown> {
    // A read never waits more than READ_TIMEOUT_MS: a hung core is a failed read, not a silent one.
    const timeout = AbortSignal.timeout(READ_TIMEOUT_MS);
    const response = await this.fetchImpl(`${this.url}${path}`, {
      headers: this.headers({ Accept: 'application/json' }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const failure = coreError.safeParse(body);
      throw failure.success
        ? new CoreError(
            `${path} : ${response.status} ${failure.data.error} (${failure.data.detail})`,
            failure.data.error,
            failure.data.detail,
          )
        : new CoreError(`${path} : ${response.status}`);
    }
    if (check === null) return body;
    const parsed = check.safeParse(body);
    if (!parsed.success)
      throw new CoreError(`${path} : réponse hors schéma (${parsed.error.message})`);
    // The answer as the core sent it: the check would fill in the schema's defaults, which the core omits.
    return body;
  }

  /**
   * The SSE stream from `lastEventId` (none: from now on), one checked event at a time; `opened` is called
   * once it is open, then at every chunk received (keep-alive included). It ends when the core closes it; it throws when it cannot open, or when an event is
   * out of schema.
   */
  async *events(
    lastEventId: string | null,
    signal: AbortSignal,
    opened: () => void = () => undefined,
  ): AsyncGenerator<CoreEvent> {
    const response = await this.fetchImpl(`${this.url}/api/events`, {
      headers: this.headers({
        Accept: 'text/event-stream',
        ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
      }),
      signal,
    });
    if (!response.ok || !response.body) throw new CoreError(`/api/events : ${response.status}`);
    // The stream is open: the core answers, even before its first event.
    opened();
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of response.body) {
      // Every chunk is a sign of life, the core's keep-alive comment included.
      opened();
      buffer += decoder.decode(chunk as Uint8Array, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = block
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        // Comment lines (": keep-alive") carry no data.
        if (!data) continue;
        const event: unknown = JSON.parse(data);
        // A kind of event added to the contract later (ADR 0018: additions only) is skipped, not an error.
        const kind = (event as { kind?: unknown } | null)?.kind;
        if (typeof kind !== 'string' || !KNOWN_KINDS.has(kind)) continue;
        const parsed = coreEvent.safeParse(event);
        if (!parsed.success)
          throw new CoreError(`/api/events : événement hors schéma (${parsed.error.message})`);
        yield event as CoreEvent;
      }
    }
  }
}
