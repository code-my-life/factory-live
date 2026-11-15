import { cardKindOf } from './cards.ts';
import { awaitingApproval } from './gateVerdicts.ts';
import type { Board, Run, Task, TaskEvent } from './board.ts';
import { groupByIssue } from './issues.ts';
import { message } from './messages.ts';
import type { Message, Text } from './messages.ts';

export type InterventionKind =
  | 'needs_input'
  | 'capability'
  | 'transient'
  | 'gave_up'
  | 'triage_loop'
  | 'held_active_pr'
  | 'pr_approval'
  | 'main_red';

/** Ce que les interventions écrivent elles-mêmes ; la raison donnée par l'agent reste telle quelle. */
export type InterventionMessage =
  | Message<'intervention.title.prReady'>
  | Message<'intervention.title.mainRed'>
  | Message<'intervention.title.gaveUp', { failures: number | null }>
  | Message<'intervention.title.needsInput'>
  | Message<'intervention.title.capability'>
  | Message<'intervention.title.transient'>
  | Message<'intervention.title.blocked'>
  | Message<'intervention.title.triageLoop'>
  | Message<'intervention.title.held', { minutes: number }>
  | Message<'intervention.question.prReady'>
  | Message<'intervention.question.gaveUp'>
  | Message<'intervention.question.needsInput'>
  | Message<'intervention.question.capability'>
  | Message<'intervention.question.transient'>
  | Message<'intervention.question.blocked'>
  | Message<'intervention.question.triageLoop'>
  | Message<'intervention.question.held'>
  | Message<'intervention.action.openIssue', { issueKey: string }>
  | Message<'intervention.action.showCard'>
  | Message<'intervention.action.approvePr'>
  | Message<'intervention.action.prWorkflows'>
  | Message<'intervention.action.reassignCoder'>
  | Message<'intervention.action.dashboard'>
  | Message<'intervention.action.relay', { owner: string }>;

export type InterventionText = Text<InterventionMessage>;

export type InterventionAction =
  | { kind: 'unblock' }
  | { kind: 'copy'; label: InterventionText; command: string }
  | { kind: 'link'; label: InterventionText; url: string };

export interface Intervention {
  /** Stable d'un calcul à l'autre : `<type>:<carte>:<événement>`, la notification ne part qu'une fois. */
  id: string;
  kind: InterventionKind;
  severity: 'critical' | 'warning' | 'info';
  /** Première ligne de la raison de l'agent, sinon un titre de factory-live. */
  title: InterventionText;
  issueKey: string | null;
  cardId: string;
  profile: string | null;
  /** La raison entière, telle que l'agent l'a écrite, sinon une explication de factory-live. */
  question: InterventionText;
  /** Secondes epoch. */
  openedAt: number;
  /** L'événement du kanban que l'intervention raconte (blocage, abandon, boucle) ; `null` : aucun. */
  eventId: number | null;
  push: boolean;
  actions: InterventionAction[];
}

export interface InterventionContext {
  /** Secondes epoch. */
  now: number;
  board: string;
  owner: string;
  /** The factory's dashboard; `null` when it is not configured: no link to it. */
  dashboardUrl: string | null;
  heldAfterSeconds: number;
}

/** Push seulement pour les blocages qui attendent Clément (décision du 2026-10-28). */
const PUSHED: ReadonlySet<InterventionKind> = new Set([
  'needs_input',
  'capability',
  'transient',
  'gave_up',
  'triage_loop',
  'held_active_pr',
]);

const MAIN_RED = /main rouge|workflows? de main|watch-main/i;

function lastOf(events: readonly TaskEvent[], kind: string): TaskEvent | undefined {
  return events.filter((event) => event.kind === kind).at(-1);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function firstLine(value: string, fallback: InterventionMessage): InterventionText {
  return value.split('\n')[0]?.trim() || fallback;
}

/** Un nom de branche git valable : pas d'espace, ni `[`, ni caractère de contrôle (et pas de `..`). */
const BRANCH = /^[\w./-]{1,250}$/;
/** Le brief de la factory nomme la branche d'une carte : « - branch_name : fix/8-island-blur ». */
const BRIEF_BRANCH = /^- branch_name : (\S{1,250})\s*$/m;

/**
 * La branche d'une carte : déclarée sur la carte, sinon notée par son dernier run (`branch`), sinon
 * celle que le brief lui donne (champ `branch_name` du skill factory-brief).
 */
export function branchOf(task: Task, runs: readonly Run[]): string | null {
  const noted = runs
    .filter((run) => run.taskId === task.id)
    .sort((left, right) => left.id - right.id)
    .map((run) => text(run.metadata['branch']))
    .filter(Boolean)
    .at(-1);
  const briefed = BRIEF_BRANCH.exec(task.body)?.[1];
  const branch = task.branchName ?? noted ?? briefed ?? null;
  return branch && BRANCH.test(branch) && !branch.includes('..') ? branch : null;
}

/** The PR's link of a set of cards, noted in their runs (`pr_url`, `published_pr`). */
export function pullRequestUrl(tasks: readonly Task[], board: Board): string | null {
  const ids = new Set(tasks.map((task) => task.id));
  const urls = board.runs
    .filter((run) => ids.has(run.taskId))
    .sort((left, right) => left.id - right.id)
    .map((run) => text(run.metadata['pr_url']) || text(run.metadata['published_pr']))
    .filter((url) => url.startsWith('https://'));
  return urls.at(-1) ?? null;
}

function issueUrl(key: string | null, owner: string): string | null {
  if (!key) return null;
  const [repo, number] = key.split('#');
  return `https://github.com/${owner}/${repo}/issues/${number}`;
}

function build(
  kind: InterventionKind,
  task: Task,
  issueKey: string | null,
  event: TaskEvent | undefined,
  openedAt: number,
  parts: {
    severity: Intervention['severity'];
    title: InterventionText;
    question: InterventionText;
    actions: InterventionAction[];
    /** Dérogation : un blocage sans type n'est pas une décision demandée par l'agent. */
    push?: boolean;
  },
): Intervention {
  const { push, ...rest } = parts;
  return {
    id: `${kind}:${task.id}:${event?.id ?? openedAt}`,
    kind,
    issueKey,
    cardId: task.id,
    profile: task.assignee,
    openedAt,
    eventId: event?.id ?? null,
    push: push ?? PUSHED.has(kind),
    ...rest,
  };
}

/**
 * The two interventions factory-live still computes on the cards the core serves: a release ready (the PR to
 * approve) and a red CI of main. The core publishes the others, with their diagnosis.
 */
function releaseIntervention(
  task: Task,
  events: readonly TaskEvent[],
  issueKey: string | null,
  issueTasks: readonly Task[],
  board: Board,
  ctx: InterventionContext,
): Intervention | null {
  if (cardKindOf(task) !== 'release') return null;
  const blocked = lastOf(events, 'blocked');
  const reason = text(blocked?.payload['reason']);
  const link = issueUrl(issueKey, ctx.owner);
  const issueLink: InterventionAction[] =
    link && issueKey
      ? [{ kind: 'link', label: message('intervention.action.openIssue', { issueKey }), url: link }]
      : [];
  const pr = pullRequestUrl(issueTasks, board);
  if (task.blockKind === 'needs_input') {
    return build('pr_approval', task, issueKey, blocked, blocked?.createdAt ?? task.createdAt, {
      severity: 'info',
      title: firstLine(reason, message('intervention.title.prReady')),
      question: reason || message('intervention.question.prReady'),
      actions: pr
        ? [{ kind: 'link', label: message('intervention.action.approvePr'), url: pr }]
        : issueLink,
    });
  }
  if (MAIN_RED.test(reason)) {
    return build('main_red', task, issueKey, blocked, blocked?.createdAt ?? task.createdAt, {
      severity: 'warning',
      title: firstLine(reason, message('intervention.title.mainRed')),
      question: reason,
      actions: pr
        ? [{ kind: 'link', label: message('intervention.action.prWorkflows'), url: pr }]
        : issueLink,
    });
  }
  return null;
}

/** What waits for the owner's action on the cards, as factory-live computes it itself. */
export function interventionsOf(board: Board, ctx: InterventionContext): Intervention[] {
  const issueOf = new Map<string, string>();
  const issueTasks = new Map<string, Task[]>();
  for (const [key, tasks] of groupByIssue(board)) {
    issueTasks.set(key, tasks);
    for (const task of tasks) issueOf.set(task.id, key);
  }
  const eventsOf = new Map<string, TaskEvent[]>();
  for (const event of [...board.events].sort((left, right) => left.id - right.id)) {
    const list = eventsOf.get(event.taskId);
    if (list) list.push(event);
    else eventsOf.set(event.taskId, [event]);
  }

  const found: Intervention[] = [];
  for (const task of board.tasks) {
    const events = eventsOf.get(task.id) ?? [];
    const issueKey = issueOf.get(task.id) ?? null;
    const siblings = issueKey ? (issueTasks.get(issueKey) ?? []) : [task];

    if (task.status === 'blocked') {
      const intervention = releaseIntervention(task, events, issueKey, siblings, board, ctx);
      if (intervention) found.push(intervention);
    } else if (task.status === 'review') {
      // Vert de la gate scriptée : la PR attend l'approbation humaine sur GitHub (la carte reste en revue jusqu'à la fusion).
      const green = awaitingApproval(task, board);
      if (green) {
        const pr = green.pullRequest ?? pullRequestUrl([task], board);
        const link = issueUrl(issueKey, ctx.owner);
        found.push(
          build('pr_approval', task, issueKey, undefined, green.at, {
            severity: 'info',
            title: message('intervention.title.prReady'),
            question: message('intervention.question.prReady'),
            actions: pr
              ? [{ kind: 'link', label: message('intervention.action.approvePr'), url: pr }]
              : link && issueKey
                ? [
                    {
                      kind: 'link',
                      label: message('intervention.action.openIssue', { issueKey }),
                      url: link,
                    },
                  ]
                : [],
          }),
        );
      }
    }
  }
  return found.sort((left, right) => left.openedAt - right.openedAt);
}
