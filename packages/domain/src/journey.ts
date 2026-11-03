import { cardKindOf } from './cards.ts';
import { scriptedVerdicts } from './gateVerdicts.ts';
import type { Board, Task } from './hermes.ts';
import type { DeliveryFacts, GateLane, LineStation } from './issues.ts';

/** Comment s'est fini un passage : vert, rouge (gate, main), changements demandés à la revue. */
export type JourneyOutcome = 'ok' | 'red' | 'changes';

export interface JourneyStep {
  station: LineStation;
  /** La preuve passée, pour un passage à la gate. */
  lane: GateLane | null;
  outcome: JourneyOutcome | null;
  /** Secondes epoch. */
  at: number;
}

type Fact =
  | { at: number; kind: 'verdict'; passed: boolean }
  | { at: number; kind: 'review'; state: 'approved' | 'changes_requested' };

/** Le premier run d'une carte d'un de ces types, en secondes epoch. */
function firstRun(tasks: readonly Task[], board: Board, kind: string): number | null {
  const ids = new Set(tasks.filter((task) => cardKindOf(task) === kind).map((task) => task.id));
  const starts = board.runs.filter((run) => ids.has(run.taskId)).map((run) => run.startedAt);
  return starts.length > 0 ? Math.min(...starts) : null;
}

/**
 * Le trajet d'une issue sur la ligne, déduit des faits et jamais d'une mémoire : le premier run de
 * chaque carte, les verdicts de la gate scriptée (un rouge renvoie à l'implémentation), les revues de
 * la PR (une demande de changements aussi), la fusion, la CI de main (rouge : revert, retour à Ta
 * revue) et le déploiement. Il finit toujours sur la station courante.
 */
export function journeyOf(
  tasks: readonly Task[],
  board: Board,
  delivery: DeliveryFacts | null,
  lane: GateLane | null,
  current: LineStation,
): JourneyStep[] {
  const steps: JourneyStep[] = [];
  const push = (station: LineStation, at: number, outcome: JourneyOutcome | null = null) =>
    steps.push({ station, lane: station === 'gate' ? lane : null, outcome, at });
  const last = () => steps.at(-1);

  const brief = tasks.find((task) => cardKindOf(task) === 'brief');
  push('intake', brief?.createdAt ?? Math.min(...tasks.map((task) => task.createdAt)));
  const briefAt = firstRun(tasks, board, 'brief');
  if (briefAt !== null) push('brief', briefAt);
  const diagnosticAt = firstRun(tasks, board, 'diagnostic');
  if (diagnosticAt !== null) push('diagnostic', diagnosticAt);
  const implAt = firstRun(tasks, board, 'impl');
  if (implAt !== null) push('implementation', implAt);

  const implIds = new Set(
    tasks.filter((task) => cardKindOf(task) === 'impl').map((task) => task.id),
  );
  const facts: Fact[] = [
    ...scriptedVerdicts(board.comments ?? [])
      .filter((verdict) => implIds.has(verdict.taskId))
      .map((verdict): Fact => ({ at: verdict.at, kind: 'verdict', passed: verdict.passed })),
    ...(delivery?.reviews ?? []).map((review): Fact => ({
      at: review.at,
      kind: 'review',
      state: review.state,
    })),
  ].sort((left, right) => left.at - right.at);

  for (const fact of facts) {
    if (fact.kind === 'verdict') {
      push('gate', fact.at, fact.passed ? 'ok' : 'red');
      push(fact.passed ? 'review' : 'implementation', fact.at);
      continue;
    }
    const step = last();
    if (step?.station !== 'review') continue;
    if (fact.state === 'changes_requested') {
      step.outcome = 'changes';
      push('implementation', fact.at);
    } else {
      step.outcome = 'ok';
      push('merge', fact.at);
    }
  }

  if (delivery?.state === 'merged') {
    const at = delivery.mergedAt ?? last()?.at ?? 0;
    const step = last();
    if (step?.station === 'review') {
      step.outcome = 'ok';
      push('merge', at);
    }
    const main = delivery.mainChecks;
    push('ci', at, main === 'success' ? 'ok' : main === 'failure' ? 'red' : null);
    if (main === 'failure') push('review', at);
    else if (main === 'success' && delivery.deployment && delivery.deployment !== 'none')
      push('deploy', at);
  }

  if (last()?.station !== current) push(current, (last()?.at ?? 0) + 1);
  return steps;
}
