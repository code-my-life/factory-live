import type { Run, TaskEvent } from '../hermes.ts';
import { classifyToolResult, isProtocolViolation } from './hermesText.ts';
import type { ToolOutcome } from './hermesText.ts';
import type {
  DiagnosisInput,
  LogFact,
  SessionFacts,
  ToolCallFact,
  ToolResultFact,
} from './types.ts';

/**
 * Ce qui ouvre un nouvel épisode : la carte change de main ou repart d'un état neuf (création,
 * déblocage, blocage ou abandon précédent, revue demandée ou rendue, réassignation, statut forcé).
 * Hermès relance parfois une carte bloquée sans événement « débloquée » : le blocage précédent suffit.
 */
const BOUNDARIES = new Set([
  'created',
  'unblocked',
  'blocked',
  'gave_up',
  'review_requested',
  'changes_requested',
  'completed',
  'promoted',
  'assigned',
  'status',
]);
const FAILED = new Set([
  'crashed',
  'blocked',
  'gave_up',
  'timed_out',
  'rate_limited',
  'spawn_failed',
]);

/** Un résultat d'outil classé, avec l'appel qui l'a produit et le run où il s'est produit. */
export interface Observation {
  readonly runId: number | null;
  readonly sessionId: string;
  readonly result: ToolResultFact;
  readonly call: ToolCallFact | null;
  readonly outcome: ToolOutcome;
}

/**
 * Les faits d'un épisode, prêts pour les règles : les runs depuis la dernière remise à zéro jusqu'à
 * l'événement raconté, leurs sessions et leurs résultats classés, et le journal de la même fenêtre.
 */
export class DiagnosisContext {
  readonly input: DiagnosisInput;
  readonly from: number;
  readonly until: number;
  readonly runs: readonly Run[];
  readonly events: readonly TaskEvent[];
  /** Le run qui a produit l'événement raconté : celui que la cause principale doit toucher. */
  readonly blockingRunId: number | null;
  readonly observations: readonly Observation[];
  readonly logs: readonly LogFact[];
  /** Tout ce qui suit l'épisode : sert à vérifier qu'une cause est corrigée. */
  readonly laterObservations: readonly Observation[];

  constructor(input: DiagnosisInput) {
    this.input = input;
    const anchor = input.anchor ?? lastFailure(input.events);
    this.until = anchor?.createdAt ?? input.now;
    let from = input.task.createdAt;
    for (const event of input.events) {
      if (event.createdAt > this.until) break;
      if (anchor && event.id >= anchor.id) break;
      if (
        BOUNDARIES.has(event.kind) ||
        (event.kind === 'reclaimed' && event.payload['manual'] === true)
      )
        from = Math.max(from, event.createdAt);
    }
    this.from = from;
    this.runs = input.runs
      .filter((run) => run.startedAt >= from - 1 && run.startedAt <= this.until)
      .sort((left, right) => left.id - right.id);
    this.events = input.events.filter(
      (event) => event.createdAt >= from && event.createdAt <= this.until,
    );
    this.blockingRunId = anchor?.runId ?? this.runs.at(-1)?.id ?? null;
    const runIds = new Set(this.runs.map((run) => run.id));
    const all = observationsOf(input.sessions ?? []);
    this.observations = all.filter(
      (item) =>
        item.result.at >= from - 1 &&
        item.result.at <= this.until + 1 &&
        (item.runId === null || runIds.has(item.runId)),
    );
    this.laterObservations = all.filter((item) => item.result.at > this.until + 1);
    this.logs = (input.logs ?? [])
      .filter((fact) => fact.at >= from - 1 && fact.at <= this.until + 1)
      .sort((left, right) => left.at - right.at);
  }

  get profile(): string | null {
    return this.input.profile?.profile ?? this.runs.at(-1)?.profile ?? this.input.task.assignee;
  }

  runOf(runId: number | null): Run | undefined {
    return runId === null ? undefined : this.runs.find((run) => run.id === runId);
  }

  observationsOfRun(runId: number): Observation[] {
    return this.observations.filter((item) => item.runId === runId);
  }

  /** Les runs sortis sans appel kanban (violation de protocole), du plus ancien au plus récent. */
  protocolViolations(): Run[] {
    return this.runs.filter(
      (run) =>
        isProtocolViolation(run.error) ||
        run.metadata['protocol_violation'] === true ||
        this.events.some((event) => event.kind === 'protocol_violation' && event.runId === run.id),
    );
  }

  failedRuns(): Run[] {
    return this.runs.filter((run) => run.outcome !== null && FAILED.has(run.outcome));
  }

  eventsOf(kind: string): TaskEvent[] {
    return this.events.filter((event) => event.kind === kind);
  }
}

function lastFailure(events: readonly TaskEvent[]): TaskEvent | null {
  return (
    [...events]
      .reverse()
      .find((event) =>
        ['blocked', 'gave_up', 'block_loop_detected', 'timed_out', 'crashed'].includes(event.kind),
      ) ?? null
  );
}

function observationsOf(sessions: readonly SessionFacts[]): Observation[] {
  const items: Observation[] = [];
  for (const unsorted of sessions) {
    // Dans l'ordre du temps, quel que soit l'ordre de lecture : le diagnostic n'en dépend pas.
    const session = {
      ...unsorted,
      calls: [...unsorted.calls].sort((left, right) => left.at - right.at),
      results: [...unsorted.results].sort((left, right) => left.at - right.at),
    };
    const calls = new Map(
      session.calls
        .filter((call) => call.callId !== null)
        .map((call) => [call.callId as string, call]),
    );
    for (const result of session.results) {
      // Sans identifiant d'appel, l'appel le plus récent du même outil avant le résultat.
      const call =
        (result.callId ? calls.get(result.callId) : undefined) ??
        [...session.calls]
          .reverse()
          .find((candidate) => candidate.tool === result.tool && candidate.at <= result.at) ??
        null;
      items.push({
        runId: session.runId,
        sessionId: session.id,
        result,
        call,
        outcome: classifyToolResult(result.content),
      });
    }
  }
  return items.sort((left, right) => left.result.at - right.result.at);
}

/** Le nombre de chaque outil, du plus fréquent au plus rare : « terminal ×12, kanban_complete ». */
export function toolsSummary(items: readonly Observation[]): string {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.result.tool, (counts.get(item.result.tool) ?? 0) + 1);
  return [...counts]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([tool, count]) => (count > 1 ? `${tool} ×${count}` : tool))
    .join(', ');
}

export function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
