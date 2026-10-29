import { cardKindOf, runRoleOf } from './cards.ts';
import type { RunRole } from './cards.ts';
import { reviewRequests, scriptedVerdicts } from './gateVerdicts.ts';
import type { ScriptedVerdict } from './gateVerdicts.ts';
import type { Board, Run, Task } from './hermes.ts';
import { groupByIssue, issueStationOf } from './issues.ts';
import type { Station } from './issues.ts';

/** Verdict de la gate sur un tour d'implémentation. */
export interface GateVerdict {
  cardId: string;
  implementerRunId: number;
  implementer: string;
  /** `metadata.harness` du run implémenteur, sans sa parenthèse : coder, coder-claude, operateur. */
  harness: string;
  claudeModel: string | null;
  passed: boolean;
  /** Secondes epoch. */
  at: number;
}

export interface FinishedIssue {
  key: string;
  outcome: 'merged' | 'stopped';
  /** Secondes epoch. */
  startedAt: number;
  finishedAt: number;
  leadTimeMinutes: number;
}

const ROLE_STATION: Partial<Record<RunRole, Station>> = {
  coordinator: 'brief',
  implementer: 'implementation',
  reviewer: 'gate',
  release: 'release',
};

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

function runsByTask(board: Board): Map<string, Run[]> {
  const grouped = new Map<string, Run[]>();
  for (const run of [...board.runs].sort((left, right) => left.id - right.id)) {
    const list = grouped.get(run.taskId);
    if (list) list.push(run);
    else grouped.set(run.taskId, [run]);
  }
  return grouped;
}

/** Chaque demande de revue et le verdict de la gate qui a suivi (approuvé : `completed`, refusé : `changes_requested`). */
/**
 * Les tours jugés par la gate scriptée de la factory : chaque demande de revue avec le premier verdict qui la suit
 * (un sha rejugé dans le même tour, après une mise à jour de la branche, ne compte pas deux fois).
 */
function scriptedReviews(board: Board): { request: Run; verdict: ScriptedVerdict }[] {
  const tasks = new Map(board.tasks.map((task) => [task.id, task]));
  const verdictsOf = new Map<string, ScriptedVerdict[]>();
  for (const verdict of scriptedVerdicts(board.comments ?? [])) {
    const list = verdictsOf.get(verdict.taskId);
    if (list) list.push(verdict);
    else verdictsOf.set(verdict.taskId, [verdict]);
  }
  const reviews: { request: Run; verdict: ScriptedVerdict }[] = [];
  for (const [taskId, verdicts] of verdictsOf) {
    const task = tasks.get(taskId);
    if (!task || cardKindOf(task) !== 'impl') continue;
    const requests = reviewRequests(board, taskId);
    requests.forEach((request, index) => {
      const asked = request.endedAt ?? request.startedAt;
      const next = requests[index + 1];
      const until = next ? (next.endedAt ?? next.startedAt) : Number.POSITIVE_INFINITY;
      const verdict = verdicts.find((candidate) => candidate.at >= asked && candidate.at < until);
      if (verdict) reviews.push({ request, verdict });
    });
  }
  return reviews;
}

export function gateVerdicts(board: Board, since = 0): GateVerdict[] {
  const tasks = new Map(board.tasks.map((task) => [task.id, task]));
  const verdicts: GateVerdict[] = [];
  for (const [taskId, runs] of runsByTask(board)) {
    const task = tasks.get(taskId);
    if (!task || cardKindOf(task) !== 'impl') continue;
    let pending: Run | null = null;
    for (const run of runs) {
      if (run.outcome === 'review_requested') {
        pending = run;
        continue;
      }
      if (!pending || runRoleOf(run, task, board.events) !== 'reviewer') continue;
      if (run.outcome !== 'completed' && run.outcome !== 'changes_requested') continue;
      const at = run.endedAt ?? run.startedAt;
      if (at >= since) {
        verdicts.push({
          cardId: taskId,
          implementerRunId: pending.id,
          implementer: pending.profile,
          harness: (text(pending.metadata['harness']) ?? pending.profile).split(' (')[0] as string,
          claudeModel: text(pending.metadata['claude_model']),
          passed: run.outcome === 'completed',
          at,
        });
      }
      pending = null;
    }
  }
  for (const { request, verdict } of scriptedReviews(board)) {
    if (verdict.at < since) continue;
    verdicts.push({
      cardId: verdict.taskId,
      implementerRunId: request.id,
      implementer: request.profile,
      harness: (text(request.metadata['harness']) ?? request.profile).split(' (')[0] as string,
      claudeModel: text(request.metadata['claude_model']),
      passed: verdict.passed,
      at: verdict.at,
    });
  }
  return verdicts;
}

/** Durées des runs terminés, en minutes, par station. */
export function stationMinutes(board: Board, since = 0): Map<Station, number[]> {
  const tasks = new Map(board.tasks.map((task) => [task.id, task]));
  const durations = new Map<Station, number[]>();
  for (const run of board.runs) {
    const task = tasks.get(run.taskId);
    if (!task || run.endedAt === null || run.endedAt < since) continue;
    const station = ROLE_STATION[runRoleOf(run, task, board.events)];
    if (!station) continue;
    const list = durations.get(station) ?? [];
    list.push((run.endedAt - run.startedAt) / 60);
    durations.set(station, list);
  }
  // La gate scriptée ne laisse pas de run : son temps va de la demande de revue au verdict (CI comprise).
  for (const { request, verdict } of scriptedReviews(board)) {
    if (verdict.at < since) continue;
    const list = durations.get('gate') ?? [];
    list.push((verdict.at - (request.endedAt ?? request.startedAt)) / 60);
    durations.set('gate', list);
  }
  return durations;
}

/** Issues arrivées au bout (release terminée) ou arrêtées, avec leur délai depuis la première carte. */
export function finishedIssues(board: Board, since = 0): FinishedIssue[] {
  const finished: FinishedIssue[] = [];
  for (const [key, tasks] of groupByIssue(board)) {
    const station = issueStationOf(tasks, board);
    if (station !== 'done' && station !== 'stopped') continue;
    const startedAt = Math.min(...tasks.map((task: Task) => task.createdAt));
    const release = tasks.find(
      (task) => cardKindOf(task) === 'release' && task.completedAt !== null,
    );
    const ends = tasks
      .map((task) => task.completedAt)
      .filter((value): value is number => value !== null);
    const finishedAt = release?.completedAt ?? (ends.length ? Math.max(...ends) : startedAt);
    if (finishedAt < since) continue;
    finished.push({
      key,
      outcome: station === 'done' ? 'merged' : 'stopped',
      startedAt,
      finishedAt,
      leadTimeMinutes: (finishedAt - startedAt) / 60,
    });
  }
  return finished.sort((left, right) => right.finishedAt - left.finishedAt);
}

/** Temps de réponse humain : d'un blocage (hors dépendance) au déblocage suivant de la même carte, en minutes. */
export function humanResponseMinutes(
  board: Board,
  since = 0,
): { blocks: number; responses: number[] } {
  const ordered = [...board.events].sort((left, right) => left.id - right.id);
  const open = new Map<string, number>();
  let blocks = 0;
  const responses: number[] = [];
  for (const event of ordered) {
    if (event.kind === 'blocked' && event.payload['kind'] !== 'dependency') {
      if (event.createdAt >= since) blocks += 1;
      if (!open.has(event.taskId)) open.set(event.taskId, event.createdAt);
    } else if (event.kind === 'unblocked') {
      const blockedAt = open.get(event.taskId);
      open.delete(event.taskId);
      if (blockedAt !== undefined && event.createdAt >= since)
        responses.push((event.createdAt - blockedAt) / 60);
    }
  }
  return { blocks, responses };
}
