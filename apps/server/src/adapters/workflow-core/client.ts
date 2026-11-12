import { coreError, coreEvent } from '@factory-live/contracts/workflow-core';
import type { CoreCheck, CoreEvent } from '@factory-live/contracts/workflow-core';

/**
 * workflow-core's HTTP API and SSE stream (ADR 0015, #57), every call behind its shared secret. Each
 * answer and each event goes through the check that `z.fromJSONSchema` builds from the copy of the
 * core's JSON Schema: an answer of another form is an error, never a half-read state.
 */

export class CoreError extends Error {}

/** The kinds of event this copy of the core's schema knows: the others are skipped. */
const KNOWN_KINDS = new Set(['changed', 'reset', 'live', 'activity']);

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

  /** One read route, its answer checked by its schema. */
  async get<T>(path: string, check: CoreCheck<T>, signal?: AbortSignal): Promise<T> {
    const response = await this.fetchImpl(`${this.url}${path}`, {
      headers: this.headers({ Accept: 'application/json' }),
      ...(signal ? { signal } : {}),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const failure = coreError.safeParse(body);
      throw new CoreError(
        failure.success
          ? `${path} : ${response.status} ${failure.data.error} (${failure.data.detail})`
          : `${path} : ${response.status}`,
      );
    }
    const parsed = check.safeParse(body);
    if (!parsed.success)
      throw new CoreError(`${path} : réponse hors schéma (${parsed.error.message})`);
    // The answer as the core sent it: the check would fill in the schema's defaults, which the core omits.
    return body as T;
  }

  /**
   * The SSE stream from `lastEventId` (none: from now on), one checked event at a time. It ends when the
   * core closes it; it throws when it cannot open, or when an event is out of schema.
   */
  async *events(lastEventId: string | null, signal: AbortSignal): AsyncGenerator<CoreEvent> {
    const response = await this.fetchImpl(`${this.url}/api/events`, {
      headers: this.headers({
        Accept: 'text/event-stream',
        ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
      }),
      signal,
    });
    if (!response.ok || !response.body) throw new CoreError(`/api/events : ${response.status}`);
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of response.body) {
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
