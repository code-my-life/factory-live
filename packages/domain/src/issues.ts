import { cardKindOf, issueKeyOf, issueRefOfTask, runRoleOf } from './cards.ts';
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
    return openWork.every((task) => isReviewing(task, board)) ? 'gate' : 'implementation';
  }

  if (ofKind('release').some((task) => task.status !== 'done')) return 'release';
  return 'done';
}

export type IssueStatus = 'active' | 'queued' | 'waiting_human' | 'blocked' | 'done' | 'stopped';

/**
 * État d'une issue pour la ligne : finie ou arrêtée selon sa station ; sinon une intervention ouverte
 * prime (elle attend Clément), puis une carte bloquée (dépendance), puis un worker en cours ; le reste attend son tour.
 */
export function issueStatusOf(
  tasks: readonly Task[],
  station: Station,
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
