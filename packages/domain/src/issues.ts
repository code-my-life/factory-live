import { cardKindOf, issueKeyOf, issueRefOfTask, runRoleOf } from './cards.ts';
import { awaitingApproval } from './gateVerdicts.ts';
import type { Board, Task } from './hermes.ts';

export type Station =
  'intake' | 'brief' | 'implementation' | 'gate' | 'release' | 'done' | 'stopped';

const PARENT_DEPTH = 6;
const WAITING = new Set(['ready', 'todo', 'triage', 'scheduled']);

/** Issue d'une carte : la sienne, sinon celle de sa carte parente (factory-brief crée les impl et release sous le brief). */
function issueKeyOfTask(
  task: Task,
  byId: Map<string, Task>,
  parents: Map<string, string>,
): string | null {
  let current: Task | undefined = task;
  for (let depth = 0; current && depth < PARENT_DEPTH; depth += 1) {
    const key = issueKeyOf(issueRefOfTask(current));
    if (key) return key;
    const parentId = parents.get(current.id);
    current = parentId ? byId.get(parentId) : undefined;
  }
  return null;
}

/** Cartes du board regroupées par issue GitHub, dans l'ordre du board. Les watch et le reste hors issue sont écartés. */
export function groupByIssue(board: Board): Map<string, Task[]> {
  const byId = new Map(board.tasks.map((task) => [task.id, task]));
  const parents = new Map(board.links.map((link) => [link.childId, link.parentId]));
  const groups = new Map<string, Task[]>();
  for (const task of board.tasks) {
    if (cardKindOf(task) === 'watch') continue;
    const key = issueKeyOfTask(task, byId, parents);
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.push(task);
    else groups.set(key, [task]);
  }
  return groups;
}

function isReviewing(task: Task, board: Board): boolean {
  if (task.status === 'review') return true;
  if (task.status !== 'running') return false;
  const runs = board.runs.filter((run) => run.taskId === task.id);
  const current = runs.find((run) => run.id === task.currentRunId) ?? runs.at(-1);
  if (!current) return false;
  const events = board.events.filter((event) => event.taskId === task.id);
  return runRoleOf(current, task, events) === 'reviewer';
}

/**
 * Étape de l'issue sur la ligne d'usine. La carte la moins avancée fixe l'étape : tant qu'une impl
 * n'est pas en revue, l'issue reste en implémentation, même si une autre attend la gate.
 */
export function issueStationOf(tasks: readonly Task[], board: Board): Station {
  const live = tasks.filter((task) => task.status !== 'archived');
  if (live.length === 0) {
    const shipped = tasks.some(
      (task) => cardKindOf(task) === 'release' && task.completedAt !== null,
    );
    return shipped ? 'done' : 'stopped';
  }
  const ofKind = (...kinds: string[]) => live.filter((task) => kinds.includes(cardKindOf(task)));

  const brief = ofKind('brief').find((task) => task.status !== 'done');
  if (brief) {
    const started = board.runs.some((run) => run.taskId === brief.id);
    return !started && WAITING.has(brief.status) ? 'intake' : 'brief';
  }

  const openWork = ofKind('impl', 'diagnostic', 'other', 'onboarding').filter(
    (task) => task.status !== 'done',
  );
  if (openWork.length > 0) {
    if (!openWork.every((task) => isReviewing(task, board))) return 'implementation';
    // La gate scriptée a rendu son vert : la carte reste en revue jusqu'à la fusion, l'issue attend l'approbation humaine.
    return openWork.every((task) => awaitingApproval(task, board)) ? 'release' : 'gate';
  }

  if (ofKind('release').some((task) => task.status !== 'done')) return 'release';
  return 'done';
}

/**
 * The stations of the factory line: the kanban's, then the delivery GitHub tells (Ta revue, Fusion,
 * CI de main, Déploiement), and the Diagnostic branch, which goes from the brief to Terminé without a PR.
 */
export type LineStation =
  | 'intake'
  | 'brief'
  | 'implementation'
  | 'gate'
  | 'review'
  | 'merge'
  | 'ci'
  | 'deploy'
  | 'done'
  | 'stopped'
  | 'diagnostic';

/** The factory's issue types (ADR 0017 of hermes-software-factory), read on the `type:*` label. */
export type IssueType =
  'bug' | 'interface' | 'fonctionnalite' | 'diagnostic' | 'tests' | 'maintenance' | 'documentation';

/** The gate's proofs: one per family of types (`proof` in the factory's `config/types.yaml`). */
export type GateLane = 'failfirst' | 'sabotage' | 'invariance' | 'documents';

const LANE_OF_TYPE: Readonly<Record<IssueType, GateLane | null>> = {
  bug: 'failfirst',
  interface: 'failfirst',
  fonctionnalite: 'failfirst',
  tests: 'sabotage',
  maintenance: 'invariance',
  documentation: 'documents',
  diagnostic: null,
};

const TYPE_LABEL = /^type:(.+)$/;

/** The type of an issue from its `type:*` label; `null` without a known label. */
export function issueTypeOf(labels: readonly { name: string }[]): IssueType | null {
  for (const label of labels) {
    const found = TYPE_LABEL.exec(label.name)?.[1];
    if (found && Object.hasOwn(LANE_OF_TYPE, found)) return found as IssueType;
  }
  return null;
}

/**
 * The proof the PR of an issue goes through at the gate. Without a type (a repository outside the
 * standard of types), the fail-first, the factory's default proof; a diagnosis has neither PR nor gate.
 */
export function gateLaneOf(type: IssueType | null): GateLane | null {
  return type ? LANE_OF_TYPE[type] : 'failfirst';
}

/** What GitHub says of the delivery of an issue: its PR, its reviews, main and the deployment. */
export interface DeliveryFacts {
  state: 'draft' | 'open' | 'merged' | 'closed';
  reviewDecision: 'approved' | 'changes_requested' | 'review_required' | null;
  /** The decided reviews of the PR, from the oldest to the most recent (epoch seconds). */
  reviews: readonly { state: 'approved' | 'changes_requested'; at: number }[];
  /** Epoch seconds. */
  mergedAt: number | null;
  /** Main's workflows on the merged sha; `null` until the PR is merged. */
  mainChecks: 'none' | 'pending' | 'success' | 'failure' | null;
  /** The last GitHub deployment of the merged sha; `null` or `none` without a deployment. */
  deployment: 'none' | 'pending' | 'success' | 'failure' | null;
}

const isDiagnostic = (task: Task) => cardKindOf(task) === 'diagnostic';

/**
 * The station of an issue on the line: the kanban's step, then, once past the gate, what GitHub says
 * of its PR. Gate green: Ta revue; PR approved: Fusion; merged: CI de main; main red: the revert PR
 * goes back through Ta revue; main green and a deployment under way: Déploiement.
 */
export function lineStationOf(
  tasks: readonly Task[],
  board: Board,
  delivery: DeliveryFacts | null,
): LineStation {
  const station = issueStationOf(tasks, board);
  const live = tasks.filter((task) => task.status !== 'archived' && task.status !== 'done');
  if (
    station === 'implementation' &&
    live.some(isDiagnostic) &&
    !live.some((task) => cardKindOf(task) === 'impl')
  )
    return 'diagnostic';
  if (station !== 'release' && station !== 'done') return station;
  if (!delivery) return station === 'release' ? 'review' : 'done';
  if (delivery.state !== 'merged') {
    if (station === 'done') return 'done';
    return delivery.reviewDecision === 'approved' ? 'merge' : 'review';
  }
  if (delivery.mainChecks === 'failure') return station === 'done' ? 'done' : 'review';
  if (delivery.mainChecks !== 'success') return 'ci';
  if (delivery.deployment === 'pending' || delivery.deployment === 'failure') return 'deploy';
  if (delivery.deployment === 'success' || station === 'done') return 'done';
  // Main is green but the release has not closed its card yet: the issue ends its main CI.
  return 'ci';
}

export type IssueStatus = 'active' | 'queued' | 'waiting_human' | 'blocked' | 'done' | 'stopped';

/**
 * État d'une issue pour la ligne : finie ou arrêtée selon sa station ; sinon une intervention ouverte
 * prime (elle attend Clément), puis une carte bloquée (dépendance), puis un worker en cours ; le reste attend son tour.
 */
export function issueStatusOf(
  tasks: readonly Task[],
  station: Station | LineStation,
  openInterventions: number,
): IssueStatus {
  if (station === 'done' || station === 'stopped') return station;
  if (openInterventions > 0) return 'waiting_human';
  const live = tasks.filter((task) => task.status !== 'archived' && task.status !== 'done');
  if (live.some((task) => task.status === 'blocked')) return 'blocked';
  if (live.some((task) => task.status === 'running')) return 'active';
  return 'queued';
}

export type ProfileStation = 'brief' | 'implementation' | 'gate' | 'release' | 'side';

/** Station d'un profil de la factory, d'après son nom (coordinator-claude est un coordinator, etc.). */
export function profileStation(profile: string): ProfileStation {
  if (profile.startsWith('coordinator')) return 'brief';
  if (profile.startsWith('coder') || profile === 'scribe') return 'implementation';
  if (profile.startsWith('gate')) return 'gate';
  if (profile === 'release') return 'release';
  return 'side';
}
