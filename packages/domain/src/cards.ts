import type { Run, Task, TaskEvent } from './hermes.ts';

export interface IssueRef {
  repo: string;
  number: number;
}

export type CardKind =
  'brief' | 'impl' | 'release' | 'diagnostic' | 'watch' | 'onboarding' | 'other';
export type RunRole = 'coordinator' | 'implementer' | 'reviewer' | 'release' | 'other';

const TITLE_REF = /^(?:(?:impl|release|brief|diagnostic)\s+)?([A-Za-z0-9_.-]+)#(\d+)\b/i;
const KEY_REF = /^gh-([A-Za-z0-9_.-]+)-(\d+)$/;
const URL_REF = /https:\/\/github\.com\/[\w.-]+\/([\w.-]+)\/issues\/(\d+)/;

function ref(repo: string | undefined, number: string | undefined): IssueRef | null {
  if (!repo || !number) return null;
  return { repo, number: Number(number) };
}

/**
 * Issue GitHub d'une carte, par ordre de confiance : le titre (règle de la factory, il l'emporte
 * sur les autres liens du brief), la clé d'idempotence de l'intake, puis la première URL d'issue du corps.
 */
export function issueRefOfTask(task: Task): IssueRef | null {
  if (/^watch\s/i.test(task.title)) return null;
  const fromTitle = TITLE_REF.exec(task.title);
  if (fromTitle) return ref(fromTitle[1], fromTitle[2]);
  const fromKey = task.idempotencyKey ? KEY_REF.exec(task.idempotencyKey) : null;
  if (fromKey) return ref(fromKey[1], fromKey[2]);
  const fromUrl = URL_REF.exec(task.body);
  return fromUrl ? ref(fromUrl[1], fromUrl[2]) : null;
}

export function issueKeyOf(issue: IssueRef | null): string | null {
  return issue ? `${issue.repo}#${issue.number}` : null;
}

/** Type d'une carte, d'après les conventions de nommage de factory-brief et de l'intake. */
export function cardKindOf(task: Pick<Task, 'title' | 'assignee'>): CardKind {
  const title = task.title.trim();
  if (/^impl\s/i.test(title)) return 'impl';
  if (/^release\s/i.test(title)) return 'release';
  if (/^watch\s/i.test(title)) return 'watch';
  if (/^diagnostic\s/i.test(title)) return 'diagnostic';
  if (task.assignee === 'tool-setup' || /onboarding/i.test(title)) return 'onboarding';
  if (TITLE_REF.test(title)) return 'brief';
  return 'other';
}

/**
 * Rôle d'un run : sur une carte impl, l'implémenteur et la gate se succèdent ; la gate se reconnaît
 * à son profil ou à l'événement `claimed` venu de la colonne `review`.
 */
export function runRoleOf(run: Run, task: Task, events: readonly TaskEvent[]): RunRole {
  switch (cardKindOf(task)) {
    case 'brief':
      return 'coordinator';
    case 'release':
      return 'release';
    case 'impl': {
      const fromReview = events.some(
        (event) =>
          event.kind === 'claimed' &&
          event.runId === run.id &&
          event.payload['source_status'] === 'review',
      );
      return fromReview || run.profile.startsWith('gate') ? 'reviewer' : 'implementer';
    }
    default:
      return 'other';
  }
}
