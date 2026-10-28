import { cardKindOf } from './cards.ts';
import type { Board, Task, TaskEvent } from './hermes.ts';
import { groupByIssue } from './issues.ts';

export type InterventionKind =
  | 'needs_input'
  | 'capability'
  | 'transient'
  | 'gave_up'
  | 'triage_loop'
  | 'held_active_pr'
  | 'pr_approval'
  | 'main_red';

export type InterventionAction =
  | { kind: 'unblock' }
  | { kind: 'copy'; label: string; command: string }
  | { kind: 'link'; label: string; url: string };

export interface Intervention {
  /** Stable d'un calcul à l'autre : `<type>:<carte>:<événement>`, la notification ne part qu'une fois. */
  id: string;
  kind: InterventionKind;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  issueKey: string | null;
  cardId: string;
  profile: string | null;
  question: string;
  /** Secondes epoch. */
  openedAt: number;
  push: boolean;
  actions: InterventionAction[];
}

export interface InterventionContext {
  /** Secondes epoch. */
  now: number;
  board: string;
  owner: string;
  dashboardUrl: string;
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

const RESET_HOLD = new Set(['claimed', 'unblocked', 'promoted', 'created', 'status', 'assigned']);
const MAIN_RED = /main rouge|workflows? de main|watch-main/i;

function lastOf(events: readonly TaskEvent[], kind: string): TaskEvent | undefined {
  return events.filter((event) => event.kind === kind).at(-1);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function firstLine(value: string, fallback: string): string {
  return value.split('\n')[0]?.trim() || fallback;
}

/** Le lien de la PR d'un ensemble de cartes, relevé dans les runs d'Hermès (`pr_url`, `published_pr`). */
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
    title: string;
    question: string;
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
    push: push ?? PUSHED.has(kind),
    ...rest,
  };
}

function blockedIntervention(
  task: Task,
  events: readonly TaskEvent[],
  issueKey: string | null,
  issueTasks: readonly Task[],
  board: Board,
  ctx: InterventionContext,
): Intervention | null {
  const blocked = lastOf(events, 'blocked');
  const gaveUp = lastOf(events, 'gave_up');
  const reason = text(blocked?.payload['reason']);
  const link = issueUrl(issueKey, ctx.owner);
  const issueLink: InterventionAction[] = link
    ? [{ kind: 'link', label: `Ouvrir l’issue ${issueKey}`, url: link }]
    : [];
  const unblock: InterventionAction[] = issueKey ? [{ kind: 'unblock' }] : [];
  const showCard: InterventionAction = {
    kind: 'copy',
    label: 'Voir la carte en CLI',
    command: `hermes kanban --board ${ctx.board} show ${task.id}`,
  };

  if (cardKindOf(task) === 'release') {
    const pr = pullRequestUrl(issueTasks, board);
    if (task.blockKind === 'needs_input') {
      return build('pr_approval', task, issueKey, blocked, blocked?.createdAt ?? task.createdAt, {
        severity: 'info',
        title: firstLine(reason, 'PR prête à approuver'),
        question:
          reason || 'La gate a approuvé la PR : ton approbation sur GitHub déclenche le merge.',
        actions: pr ? [{ kind: 'link', label: 'Approuver la PR sur GitHub', url: pr }] : issueLink,
      });
    }
    if (MAIN_RED.test(reason)) {
      return build('main_red', task, issueKey, blocked, blocked?.createdAt ?? task.createdAt, {
        severity: 'warning',
        title: firstLine(reason, 'Main rouge après le merge'),
        question: reason,
        actions: pr ? [{ kind: 'link', label: 'Voir la PR et ses workflows', url: pr }] : issueLink,
      });
    }
  }

  if (gaveUp && (!blocked || gaveUp.id > blocked.id)) {
    const failures = Number(gaveUp.payload['failures'] ?? 0);
    return build('gave_up', task, issueKey, gaveUp, gaveUp.createdAt, {
      severity: 'critical',
      title: `Abandon après ${failures || 'plusieurs'} échecs`,
      question:
        text(gaveUp.payload['error']) ||
        reason ||
        'Le disjoncteur du dispatcher a arrêté la carte.',
      actions: [...unblock, showCard, ...issueLink],
    });
  }

  const opened = blocked?.createdAt ?? task.createdAt;
  switch (task.blockKind) {
    case 'needs_input':
      return build('needs_input', task, issueKey, blocked, opened, {
        severity: 'critical',
        title: firstLine(reason, 'Décision attendue'),
        question: reason || 'L’agent attend ta décision.',
        actions: [...unblock, ...issueLink],
      });
    case 'capability':
      return build('capability', task, issueKey, blocked, opened, {
        severity: 'critical',
        title: firstLine(reason, 'Outil ou accès manquant'),
        question: reason || 'Un outil ou un accès manque à l’agent.',
        actions: [...unblock, showCard, ...issueLink],
      });
    case 'transient':
      return build('transient', task, issueKey, blocked, opened, {
        severity: 'warning',
        title: firstLine(reason, 'Échec passager'),
        question: reason || 'Échec passager de la lane.',
        actions: [
          ...unblock,
          {
            kind: 'copy',
            label: 'Réassigner à coder (Hermès natif)',
            command: `hermes kanban --board ${ctx.board} reassign ${task.id} coder --reason "échec passager de la lane" && hermes kanban --board ${ctx.board} unblock ${task.id}`,
          },
        ],
      });
    case 'dependency':
      return null;
    default:
      return build('needs_input', task, issueKey, blocked, opened, {
        severity: 'warning',
        title: firstLine(reason, 'Carte bloquée'),
        question: reason || 'Carte bloquée sans raison donnée.',
        actions: [...unblock, showCard, ...issueLink],
        push: false,
      });
  }
}

function heldSince(events: readonly TaskEvent[]): number | null {
  let since: number | null = null;
  for (const event of events) {
    if (RESET_HOLD.has(event.kind)) since = null;
    else if (event.kind === 'respawn_guarded' && event.payload['reason'] === 'active_pr')
      since ??= event.createdAt;
  }
  return since;
}

/** Ce qui attend une action de Clément, carte par carte, avec ce qu'il peut faire depuis l'app. */
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
      const intervention = blockedIntervention(task, events, issueKey, siblings, board, ctx);
      if (intervention) found.push(intervention);
    } else if (task.status === 'triage' && lastOf(events, 'block_loop_detected')) {
      const loop = lastOf(events, 'block_loop_detected');
      found.push(
        build('triage_loop', task, issueKey, loop, loop?.createdAt ?? task.createdAt, {
          severity: 'critical',
          title: 'Bloquée deux fois pour la même raison : carte passée en triage',
          question:
            '`/factory unblock` ne s’applique pas à une carte en triage. Sors-la par le tableau de bord d’Hermès (glisser vers Ready), jamais par specify ni decompose : un spécificateur pourrait réécrire le brief.',
          actions: [
            { kind: 'link', label: 'Ouvrir le tableau de bord d’Hermès', url: ctx.dashboardUrl },
            {
              kind: 'copy',
              label: 'Voir la carte en CLI',
              command: `hermes kanban --board ${ctx.board} show ${task.id}`,
            },
          ],
        }),
      );
    } else if (task.status === 'ready') {
      const since = heldSince(events);
      if (since !== null && ctx.now - since >= ctx.heldAfterSeconds) {
        const minutes = Math.round((ctx.now - since) / 60);
        const owner = task.assignee ?? 'coder';
        found.push(
          build('held_active_pr', task, issueKey, undefined, since, {
            severity: 'warning',
            title: `Carte prête mais retenue depuis ${minutes} min`,
            question:
              'Le dispatcher retient la carte : un commentaire de moins de 24 h cite une URL de PR, sans relais depuis. C’est la garde `active_pr` d’Hermès contre les PR en double. La carte n’est pas bloquée, `/factory unblock` ne s’applique donc pas : il faut la relayer.',
            actions: [
              {
                kind: 'copy',
                label: `Relancer par relais (scribe puis ${owner})`,
                command: `hermes kanban --board ${ctx.board} reassign ${task.id} scribe --reason "relais active_pr" && hermes kanban --board ${ctx.board} reassign ${task.id} ${owner} --reason "reprise sur la PR"`,
              },
            ],
          }),
        );
      }
    }
  }
  return found.sort((left, right) => left.openedAt - right.openedAt);
}
