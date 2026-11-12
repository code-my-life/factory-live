import type { WorkflowSheet } from '@factory-live/contracts';
import {
  coreActivity,
  coreItems,
  coreLive,
  coreSheetResponse,
  coreUsage,
  coreWorkflows,
} from '@factory-live/contracts/workflow-core';
import type {
  CoreAgent,
  CoreFact,
  CoreItem,
  CoreSheet,
} from '@factory-live/contracts/workflow-core';
import type {
  CoreActivityFact,
  CoreAgentState,
  KanbanDelta,
  LoggerPort,
  PublishedSheet,
  UsageRow,
  WorkflowView,
} from '../../application/ports.ts';
import { boardOf } from './cards.ts';
import { WorkflowCoreClient } from './client.ts';
import { coreActivityFact, coreAgentState } from './live.ts';

/** Where the reader sends what it reads: main.ts wires it to the hub, the code line's sheet and the list. */
export interface CoreSink {
  /** The whole board of the code line, replacing the one held. */
  board(delta: KanbanDelta, readAt: number): void;
  /** The code line's sheet, as the core judged it. */
  sheet(sheet: PublishedSheet): void;
  /** The other workflows the core declares, besides the code line and those read by their own adapter. */
  workflows(views: WorkflowView[]): void;
  /** A read or the stream failed: the last state stays. */
  failed(error: string, at: number): void;
  /** Every agent of the code line the core follows, replacing those held (#66). */
  live(agents: CoreAgentState[]): void;
  /** Facts of the code line's activity, oldest first; those already sent come again after a full read. */
  activity(facts: CoreActivityFact[]): void;
  /** The code line's usage, one row per day, model, provider and agent (#66). */
  usage(rows: UsageRow[]): void;
}

export interface WorkflowCoreReaderOptions {
  url: string;
  secret: string;
  /** The key of the code line's workflow (`factory`). */
  code: string;
  /** The workflows still read by their own adapter (`studio`, until its epic): never read here. */
  own: readonly string[];
  /** The pause before a new attempt, after a failure: 2 s at most. */
  retryMs?: number;
  now: () => number;
  log: LoggerPort;
  sink: CoreSink;
  fetch?: typeof fetch;
}

const RETRY_MS = 2_000;
/** The facts of activity read at a full read: as many as the screen keeps. */
const ACTIVITY_LIMIT = 200;
/** The days of usage read at a full read: as many as the core serves. */
export const USAGE_DAYS = 90;

/**
 * Reads the code line and every generic workflow from workflow-core (ADR 0015, #57): the full state at
 * start, then the SSE stream, each event replacing the item it carries. A cut stream resumes from the
 * last cursor; a `reset` (or a cursor the core no longer knows, which it answers with a `reset`) makes
 * it read the full state again. Without an answer, the last state stays and it tries again.
 */
export class WorkflowCoreReader {
  private readonly client: WorkflowCoreClient;
  private readonly options: WorkflowCoreReaderOptions;
  private items = new Map<string, Map<string, CoreItem>>();
  private readonly sheets = new Map<string, CoreSheet>();
  private readonly readAt = new Map<string, number>();
  /** The code line's agents the core follows, by agent. */
  private agents = new Map<string, CoreAgent>();
  private cursor: string | null = null;
  private unreachableSince: number | null = null;
  private lastError: string | null = null;
  private running = false;
  private abort = new AbortController();
  private loop: Promise<void> | null = null;

  constructor(options: WorkflowCoreReaderOptions) {
    this.options = options;
    this.client = new WorkflowCoreClient({
      url: options.url,
      secret: options.secret,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.abort = new AbortController();
    this.loop = this.run();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.abort.abort();
    await this.loop;
    this.loop = null;
  }

  private async run(): Promise<void> {
    let fullRead = true;
    while (this.running) {
      try {
        if (fullRead) {
          await this.readAll();
          fullRead = false;
        }
        fullRead = await this.follow();
        // A stream that ended without a reset: wait before opening it again, as after a failure.
        if (!fullRead && this.running) await this.pause();
      } catch (error) {
        if (!this.running) break;
        this.failed(error);
        await this.pause();
      }
    }
  }

  private failed(error: unknown): void {
    const now = this.options.now();
    const message = error instanceof Error ? error.message : String(error);
    this.unreachableSince ??= now;
    if (message !== this.lastError)
      this.options.log.warn({ error: message }, 'lecture du socle en échec : dernier état gardé');
    this.lastError = message;
    this.options.sink.failed(message, now);
  }

  private pause(): Promise<void> {
    const ms = Math.min(this.options.retryMs ?? RETRY_MS, RETRY_MS);
    const signal = this.abort.signal;
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      signal.addEventListener('abort', done, { once: true });
    });
  }

  /** The full state: the declared workflows, then each one's sheet and items. */
  private async readAll(): Promise<void> {
    const signal = this.abort.signal;
    const listed = await this.client.get('/api/workflows', coreWorkflows, signal);
    // The cursor is taken before the items: an event that falls between comes again, harmless.
    const cursor = listed.cursor ?? null;
    const keys = listed.workflows
      .map((workflow) => workflow.key)
      .filter((key) => !this.options.own.includes(key));
    const items = new Map<string, Map<string, CoreItem>>();
    for (const key of keys) {
      const path = `/api/workflows/${encodeURIComponent(key)}`;
      try {
        const answer = await this.client.get(`${path}/sheet`, coreSheetResponse, signal);
        this.sheets.set(key, answer.sheet);
      } catch (error) {
        // A sheet of a wrong form, or none: the last good one stays.
        if (signal.aborted) throw error;
        this.options.log.warn(
          { workflow: key, error: error instanceof Error ? error.message : String(error) },
          'fiche du socle refusée : la dernière reçue reste',
        );
      }
      const answer = await this.client.get(`${path}/items`, coreItems, signal);
      items.set(key, new Map(answer.items.map((item) => [item.id, item])));
    }
    let agents: CoreAgent[] = [];
    let facts: CoreFact[] = [];
    const code = this.options.code;
    if (items.has(code)) {
      const path = `/api/workflows/${encodeURIComponent(code)}`;
      agents = (await this.client.get(`${path}/live`, coreLive, signal)).agents;
      facts = (
        await this.client.get(`${path}/activity?limit=${ACTIVITY_LIMIT}`, coreActivity, signal)
      ).facts;
    }
    this.items = items;
    this.agents = new Map(agents.map((agent) => [agent.agent, agent]));
    this.cursor = cursor;
    this.answered();
    for (const key of keys) this.readAt.set(key, this.options.now());
    this.emitAll();
    this.options.sink.live(this.liveAgents());
    this.options.sink.activity(facts.map(coreActivityFact));
    if (items.has(code)) await this.refreshUsage(USAGE_DAYS);
  }

  /** Follows the stream until it ends (false: resume from the cursor) or asks for a full read (true). */
  private async follow(): Promise<boolean> {
    for await (const event of this.client.events(this.cursor, this.abort.signal)) {
      this.cursor = event.cursor;
      this.answered();
      if (event.kind === 'reset') return true;
      if (event.workflow === null || event.item === null || event.state === null) continue;
      if (this.options.own.includes(event.workflow)) continue;
      if (event.kind === 'live' || event.kind === 'activity') {
        if (event.workflow === this.options.code) this.live(event.kind, event.state);
        continue;
      }
      const held = this.items.get(event.workflow);
      // A workflow declared since the last full read: read it all.
      if (!held) return true;
      const item = event.state as CoreItem;
      held.set(event.item, item);
      // A card no longer in progress has no agent on it any more: the core sends no departure (#34).
      if (event.workflow === this.options.code && item.current_run_id === null)
        this.dropAgentsOf(event.item);
      this.readAt.set(event.workflow, this.options.now());
      this.emit(event.workflow);
    }
    return false;
  }

  /**
   * Reads the code line's usage over the last `days` days and sends its rows; a failure is logged and
   * leaves the stored days as they are (main.ts asks again every minute).
   */
  async refreshUsage(days: number): Promise<void> {
    const path = `/api/workflows/${encodeURIComponent(this.options.code)}/usage?days=${days}`;
    try {
      const usage = await this.client.get(path, coreUsage, this.abort.signal);
      this.options.sink.usage(
        usage.rows.map((row) => ({
          day: row.day,
          model: row.model,
          provider: row.provider,
          profile: row.agent,
          calls: row.calls,
          input: row.input_tokens,
          output: row.output_tokens,
          rateLimited: row.rate_limited,
          errors: row.errors,
        })),
      );
    } catch (error) {
      if (this.abort.signal.aborted) return;
      this.options.log.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'usage du socle illisible : les jours gardés restent',
      );
    }
  }

  private live(kind: 'live' | 'activity', state: unknown): void {
    if (kind === 'activity') {
      this.options.sink.activity([coreActivityFact(state as CoreFact)]);
      return;
    }
    const agent = state as CoreAgent;
    this.agents.set(agent.agent, agent);
    this.options.sink.live(this.liveAgents());
  }

  private dropAgentsOf(item: string): void {
    const before = this.agents.size;
    for (const [name, agent] of this.agents) if (agent.item === item) this.agents.delete(name);
    if (this.agents.size !== before) this.options.sink.live(this.liveAgents());
  }

  private liveAgents(): CoreAgentState[] {
    return [...this.agents.values()].map(coreAgentState);
  }

  private answered(): void {
    if (this.unreachableSince !== null) this.options.log.info({}, 'lecture du socle rétablie');
    this.unreachableSince = null;
    this.lastError = null;
  }

  private emitAll(): void {
    const code = this.options.code;
    if (this.items.has(code)) {
      this.emit(code);
      return;
    }
    // The code line is no longer declared by the core: its cards go too.
    this.options.sink.board(boardOf([]), this.options.now());
    this.options.sink.workflows(this.views());
  }

  private emit(key: string): void {
    if (key !== this.options.code) {
      this.options.sink.workflows(this.views());
      return;
    }
    const sheet = this.sheets.get(key);
    // The core judged the sheet and its schema checked its form: the code line draws it as it is.
    if (sheet) this.options.sink.sheet({ source: 'published', sheet: sheet as WorkflowSheet });
    this.options.sink.board(
      boardOf([...(this.items.get(key)?.values() ?? [])]),
      this.options.now(),
    );
    this.options.sink.workflows(this.views());
  }

  /** The generic workflows: their sheet and the state of their read; their screen comes later (#65). */
  private views(): WorkflowView[] {
    return [...this.items.keys()]
      .filter((key) => key !== this.options.code)
      .map((key) => ({
        name: key,
        sheet: (this.sheets.get(key) as WorkflowSheet | undefined) ?? null,
        sheetError: null,
        items: [],
        readAt: this.readAt.get(key) ?? null,
        unreachableSince: this.unreachableSince,
        error: this.lastError,
      }));
  }
}
