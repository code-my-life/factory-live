import type { Diagnosis, RunVerdict, WorkflowSheet } from '@factory-live/contracts';
import {
  coreActivity,
  coreDiagnosis,
  coreInterventions,
  coreItems,
  coreLive,
  coreMachine,
  coreRunVerdicts,
  coreSheetResponse,
  coreUsage,
  coreWorkflows,
} from '@factory-live/contracts/workflow-core';
import type {
  CoreAgent,
  CoreFact,
  CoreIntervention,
  CoreItem,
  CoreMachineCheck,
  CoreSheet,
} from '@factory-live/contracts/workflow-core';
import type {
  CoreActivityFact,
  DeclaredGesture,
  CoreAgentState,
  CoreCheckState,
  CoreInterventionState,
  CoreMachineState,
  KanbanDelta,
  LoggerPort,
  PublishedSheet,
  UsageRow,
  WorkflowView,
} from '../../application/ports.ts';
import { boardOf } from './cards.ts';
import { WorkflowCoreClient } from './client.ts';
import { coreInterventionState } from './interventions.ts';
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
  /** Every open intervention of the code line, from a full read (#59). */
  interventions(items: CoreInterventionState[]): void;
  /** An intervention the core announces as opened, then as closed (#59). */
  /**
   * The gestures each workflow declares (#61), by workflow, the ones read by their own adapter included: the
   * owner may post them from the screen. A workflow that declares none has an empty list.
   */
  gestures(declared: Record<string, DeclaredGesture[]>): void;
  interventionOpened(item: CoreInterventionState): void;
  interventionClosed(id: string): void;
  /** The diagnoses of the interventions, by id; `null` for one of a refused form (#59). */
  diagnoses(entries: [string, Diagnosis | null][]): void;
  /** The verdicts of a card's failed runs (#59). */
  verdicts(cardId: string, verdicts: RunVerdict[]): void;
  /** The core answered: a read succeeded, or its stream is open or sent an event (#62). */
  answered(at: number): void;
  /** The state of the machine the core publishes, read in full (#62). */
  machine(machine: CoreMachineState): void;
  /** The machine's checks, from an event of the stream (#62). */
  checks(checks: CoreCheckState[]): void;
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
/** The reads of run verdicts at once (#59): enough to fill a board at start, without flooding the core. */
const VERDICT_READS = 4;

/** A card with a run that ended otherwise than completed: the core gives its runs' verdicts (#59). */
function hasFailedRun(item: CoreItem): boolean {
  return item.runs.some((run) => run.ended_at !== null && run.outcome !== 'completed');
}

/** Whether cursor `a` (`<epoch>:<n>`) comes before cursor `b`. */
function older(a: string, b: string): boolean {
  const [ea = 0, na = 0] = a.split(':').map(Number);
  const [eb = 0, nb = 0] = b.split(':').map(Number);
  return ea < eb || (ea === eb && na < nb);
}
/** A check of the machine, in factory-live's units (#62). */
function checkState(check: CoreMachineCheck): CoreCheckState {
  return {
    id: check.id,
    label: check.label,
    group: check.group,
    status: check.status,
    detail: check.detail,
    metrics: check.metrics ?? {},
    checkedAt: Date.parse(check.checked_at),
  };
}

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
  /** The code line's open interventions, by id, with their card (#59). */
  private openCards = new Map<string, string>();
  /** The reads of diagnoses and verdicts, done beside the stream (#59). */
  private diagnosesBusy = false;
  private diagnosesAgain = false;
  private readonly verdictsQueue: string[] = [];
  private readonly verdictsQueued = new Set<string>();
  private readonly verdictsReading = new Set<string>();
  private readonly verdictsAgain = new Set<string>();
  /** The code line's agents the core follows, by agent. */
  private agents = new Map<string, CoreAgent>();
  private cursor: string | null = null;
  /** The gestures each workflow declares, from the last full read (#61). */
  private declared: Record<string, DeclaredGesture[]> = {};
  /** The machine's last checks, and the cursor of the event or read they come from (#62). */
  private checks: CoreCheckState[] = [];
  private checksCursor: string | null = null;
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
    this.declared = Object.fromEntries(
      listed.workflows.map((workflow) => [
        workflow.key,
        (workflow.gestures ?? []).map((gesture) => ({
          name: gesture.name,
          kind: gesture.kind,
          repo: gesture.repo ?? null,
        })),
      ]),
    );
    this.options.sink.gestures(this.declared);
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
    if (items.has(code)) {
      await this.refreshUsage(USAGE_DAYS);
      await this.readInterventions();
      for (const item of this.items.get(code)?.values() ?? [])
        if (hasFailedRun(item)) this.scheduleVerdicts(item.id);
    }
    await this.refreshMachine();
  }

  /**
   * Reads the state of the machine the core publishes and sends it (#62); a failure is logged and leaves the
   * last state as it is (main.ts asks again every 30 seconds).
   */
  async refreshMachine(): Promise<void> {
    try {
      const machine = await this.client.get('/api/machine', coreMachine, this.abort.signal);
      this.answered();
      // An answer older than the last `machine` event (its cursor was taken before the read) keeps the
      // event's checks: an older answer never undoes a newer one.
      const cursor = machine.cursor ?? null;
      if (cursor === null || this.checksCursor === null || !older(cursor, this.checksCursor)) {
        this.checks = (machine.checks ?? []).map(checkState);
        if (cursor !== null) this.checksCursor = cursor;
      }
      this.options.sink.machine({
        runtimeVersion: machine.runtime_version,
        contract: machine.contract
          ? { ok: machine.contract.ok, problems: machine.contract.problems }
          : null,
        mode: machine.mode,
        boards: Object.entries(machine.boards).map(([board, read]) => ({
          board,
          lastReadAt: read.last_read_at === null ? null : Date.parse(read.last_read_at),
        })),
        checks: this.checks,
      });
    } catch (error) {
      if (this.abort.signal.aborted) return;
      // A read that fails, or hangs past its timeout, is a failed contact.
      this.failed(error);
      this.options.log.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'état de la machine du socle illisible : le dernier reste',
      );
    }
  }

  /** Follows the stream until it ends (false: resume from the cursor) or asks for a full read (true). */
  private async follow(): Promise<boolean> {
    const stream = this.client.events(this.cursor, this.abort.signal, () => this.answered());
    for await (const event of stream) {
      this.cursor = event.cursor;
      this.answered();
      if (event.kind === 'reset') return true;
      if (event.kind === 'machine') {
        this.checks = (event.state as CoreMachineCheck[]).map(checkState);
        this.checksCursor = event.cursor;
        this.options.sink.checks(this.checks);
        continue;
      }
      if (event.workflow === null || event.state === null) continue;
      if (this.options.own.includes(event.workflow)) continue;
      // A fact of activity may name no card (a tick of the dispatcher): only a card's change needs one.
      if (event.kind === 'live' || event.kind === 'activity') {
        if (event.workflow === this.options.code) this.live(event.kind, event.state);
        continue;
      }
      if (event.kind === 'intervention_opened' || event.kind === 'intervention_closed') {
        if (event.workflow === this.options.code) this.intervention(event.kind, event.state);
        continue;
      }
      if (event.item === null) continue;
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
      if (event.workflow === this.options.code) {
        // A card with an open intervention: its diagnosis may have changed; a failed run: its verdict.
        if ([...this.openCards.values()].includes(event.item)) this.scheduleDiagnoses();
        if (hasFailedRun(item)) this.scheduleVerdicts(event.item);
      }
    }
    return false;
  }

  /** The code line's open interventions (#59), then their diagnoses. */
  private async readInterventions(): Promise<void> {
    const path = `/api/workflows/${encodeURIComponent(this.options.code)}/interventions`;
    const answer = await this.client.get(path, coreInterventions, this.abort.signal);
    this.openCards = new Map(answer.interventions.map((item) => [item.id, item.item]));
    this.options.sink.interventions(
      answer.interventions.map((item) => coreInterventionState(item, this.codeGestures())),
    );
    this.scheduleDiagnoses();
  }

  /** The gestures the code line declares: an intervention's gesture shows only if it is one of them. */
  private codeGestures(): ReadonlySet<string> {
    return new Set((this.declared[this.options.code] ?? []).map((gesture) => gesture.name));
  }

  private intervention(kind: 'intervention_opened' | 'intervention_closed', state: unknown): void {
    if (kind === 'intervention_closed') {
      const id = (state as { id: string }).id;
      this.openCards.delete(id);
      this.options.sink.interventionClosed(id);
      return;
    }
    const item = state as CoreIntervention;
    this.openCards.set(item.id, item.item);
    this.options.sink.interventionOpened(coreInterventionState(item, this.codeGestures()));
    this.scheduleDiagnoses();
  }

  /**
   * Reads the diagnoses again without holding the stream: a read already running is followed by one more,
   * never by several (#59).
   */
  private scheduleDiagnoses(): void {
    if (this.diagnosesBusy) {
      this.diagnosesAgain = true;
      return;
    }
    this.diagnosesBusy = true;
    void this.refreshDiagnoses().finally(() => {
      this.diagnosesBusy = false;
      if (!this.diagnosesAgain || !this.running) return;
      this.diagnosesAgain = false;
      this.scheduleDiagnoses();
    });
  }

  /**
   * Reads a card's verdicts without holding the stream, `VERDICT_READS` at a time (#59). A card is read
   * once at a time: asked again during its read, it is read once more after it, so an older answer never
   * replaces a newer one.
   */
  private scheduleVerdicts(cardId: string): void {
    if (this.verdictsReading.has(cardId)) {
      this.verdictsAgain.add(cardId);
      return;
    }
    if (this.verdictsQueued.has(cardId)) return;
    this.verdictsQueued.add(cardId);
    this.verdictsQueue.push(cardId);
    this.pumpVerdicts();
  }

  private pumpVerdicts(): void {
    while (
      this.running &&
      this.verdictsReading.size < VERDICT_READS &&
      this.verdictsQueue.length > 0
    ) {
      const cardId = this.verdictsQueue.shift()!;
      this.verdictsQueued.delete(cardId);
      this.verdictsReading.add(cardId);
      void this.refreshVerdicts(cardId).finally(() => {
        this.verdictsReading.delete(cardId);
        if (this.verdictsAgain.delete(cardId)) this.scheduleVerdicts(cardId);
        this.pumpVerdicts();
      });
    }
  }

  /**
   * The diagnoses of the code line's interventions, as the core computes them (#59). Each one is checked by
   * the schema drawn from the core's JSON Schema of a diagnosis; one of another form is left out, and its
   * intervention is shown without it. A failure keeps the diagnoses held.
   */
  async refreshDiagnoses(): Promise<void> {
    const path = `/api/workflows/${encodeURIComponent(this.options.code)}/diagnoses`;
    try {
      const answer = await this.client.get(path, null, this.abort.signal);
      const listed = (answer as { diagnoses?: unknown } | null)?.diagnoses;
      const entries: [string, Diagnosis | null][] = [];
      for (const entry of Array.isArray(listed) ? listed : []) {
        const id = (entry as { trigger?: { id?: unknown } } | null)?.trigger?.id;
        if (typeof id !== 'string') continue;
        const diagnosis = (entry as { diagnosis?: unknown }).diagnosis;
        const checked = coreDiagnosis.safeParse(diagnosis);
        if (!checked.success)
          this.options.log.warn(
            { interventionId: id, error: checked.error.message },
            'diagnostic du socle hors schéma : intervention montrée sans lui',
          );
        // The diagnosis as the core sent it, which is factory-live's contract (the check adds defaults).
        entries.push([id, checked.success ? (diagnosis as Diagnosis) : null]);
      }
      this.options.sink.diagnoses(entries);
    } catch (error) {
      if (this.abort.signal.aborted) return;
      this.options.log.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'diagnostics du socle illisibles : les derniers restent',
      );
    }
  }

  /** The verdicts of a card's failed runs, as the core computes them (#59); a failure keeps those held. */
  async refreshVerdicts(cardId: string): Promise<void> {
    const path = `/api/workflows/${encodeURIComponent(this.options.code)}/items/${encodeURIComponent(cardId)}/run-verdicts`;
    try {
      const answer = await this.client.get(path, coreRunVerdicts, this.abort.signal);
      this.options.sink.verdicts(cardId, answer.verdicts as RunVerdict[]);
    } catch (error) {
      if (this.abort.signal.aborted) return;
      this.options.log.warn(
        { cardId, error: error instanceof Error ? error.message : String(error) },
        'verdicts des runs du socle illisibles : les derniers restent',
      );
    }
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
    this.options.sink.answered(this.options.now());
  }

  private emitAll(): void {
    const code = this.options.code;
    if (this.items.has(code)) {
      this.emit(code);
      return;
    }
    // The code line is no longer declared by the core: its cards and its interventions go too.
    this.options.sink.board(boardOf([]), this.options.now());
    this.openCards = new Map();
    this.options.sink.interventions([]);
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
