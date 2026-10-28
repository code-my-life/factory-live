import type { Run, TaskEvent } from './hermes.ts';
import { redactSecrets } from './redact.ts';

/** Commentaire d'une carte (`task_comments`). */
export interface Comment {
  id: number;
  taskId: string;
  author: string;
  body: string;
  /** Secondes epoch. */
  createdAt: number;
}

export type Tone = 'neutral' | 'success' | 'attention' | 'danger' | 'done';

export interface TimelineItem {
  id: string;
  /** Secondes epoch. */
  at: number;
  source: 'kanban' | 'comment';
  profile: string | null;
  cardId: string;
  label: string;
  detail: string | null;
  tone: Tone;
}

type Payload = Readonly<Record<string, unknown>>;
type Describe = (payload: Payload) => { label: string; detail?: string | null; tone?: Tone } | null;

const DETAIL_MAX = 280;
/** Événements répétés à chaque tick tant que la situation dure : une seule ligne, avec le nombre. */
const REPEATING = new Set(['respawn_guarded', 'dependency_wait']);

const BLOCK_KINDS: Readonly<Record<string, string>> = {
  needs_input: 'décision attendue',
  capability: 'outil ou accès manquant',
  transient: 'échec passager',
  dependency: 'dépendance',
};

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function clip(value: string | null): string | null {
  if (!value) return null;
  const clean = redactSecrets(value).trim();
  return clean.length > DETAIL_MAX ? `${clean.slice(0, DETAIL_MAX - 1)}…` : clean;
}

/** Libellés des événements de `task_events` (types relevés sur le board réel le 2026-10-28). */
const DESCRIBE: Readonly<Record<string, Describe>> = {
  heartbeat: () => null,
  commented: () => null,
  spawned: () => null,
  linked: () => null,
  unlinked: () => null,
  created: (p) => ({
    label: 'Carte créée',
    detail: text(p['assignee']) ? `pour ${text(p['assignee'])}` : null,
  }),
  claimed: () => ({ label: 'Carte prise' }),
  promoted: () => ({ label: 'Carte prête', detail: 'ses dépendances sont terminées' }),
  status: (p) => ({ label: `Statut : ${text(p['status']) ?? '?'}` }),
  assigned: (p) => ({
    label: `Réassignée à ${text(p['assignee']) ?? '?'}`,
    detail: text(p['from']) ? `avant : ${text(p['from'])}` : null,
  }),
  edited: (p) => ({
    label: 'Carte modifiée',
    detail: Array.isArray(p['fields']) ? p['fields'].join(', ') : null,
  }),
  attached: (p) => ({ label: 'Pièce jointe', detail: text(p['filename']) }),
  scheduled: (p) => ({ label: 'Carte planifiée', detail: text(p['reason']) }),
  review_requested: (p) => ({
    label: `Revue demandée à ${text(p['reviewer']) ?? 'la gate'}`,
    detail: text(p['summary']),
    tone: 'attention',
  }),
  review_reopened: () => ({ label: 'Revue rouverte', tone: 'attention' }),
  changes_requested: (p) => ({
    label: `Changements demandés par ${text(p['reviewer']) ?? 'la gate'}`,
    detail: text(p['reason']),
    tone: 'danger',
  }),
  pr_acceptance: (p) =>
    p['ok'] === true
      ? { label: 'Contrôles de la PR au vert', detail: text(p['pr_url']), tone: 'success' }
      : {
          label: 'Contrôles de la PR en échec',
          detail: text(p['classification']) ?? text(p['pr_url']),
          tone: 'danger',
        },
  completed: (p) => ({ label: 'Carte terminée', detail: text(p['summary']), tone: 'done' }),
  archived: () => ({ label: 'Carte archivée' }),
  blocked: (p) => {
    const kind = BLOCK_KINDS[text(p['kind']) ?? ''];
    return {
      label: kind ? `Carte bloquée : ${kind}` : 'Carte bloquée',
      detail: text(p['reason']),
      tone: 'danger',
    };
  },
  unblocked: () => ({ label: 'Carte débloquée', tone: 'success' }),
  block_loop_detected: () => ({
    label: 'Boucle de blocage : carte passée en triage',
    tone: 'danger',
  }),
  respawn_guarded: (p) => ({
    label: 'Relance retenue',
    detail:
      p['reason'] === 'active_pr'
        ? 'Une PR citée il y a moins de 24 h attend un relais (garde active_pr)'
        : text(p['reason']),
    tone: 'attention',
  }),
  dependency_wait: (p) => ({ label: 'En attente de la carte parente', detail: text(p['parent']) }),
  reclaimed: (p) => ({
    label: 'Carte reprise au worker',
    detail: p['manual'] === true ? 'à la main' : text(p['reason']),
    tone: 'attention',
  }),
  crashed: (p) => ({
    label: 'Worker planté',
    detail:
      [text(p['exit_kind']), typeof p['exit_code'] === 'number' ? `code ${p['exit_code']}` : null]
        .filter(Boolean)
        .join(', ') || null,
    tone: 'danger',
  }),
  timed_out: (p) => ({
    label: 'Délai du worker dépassé',
    detail: text(p['error']),
    tone: 'danger',
  }),
  rate_limited: () => ({ label: 'Worker arrêté par une limite du fournisseur', tone: 'attention' }),
  protocol_violation: () => ({
    label: 'Worker sorti sans terminer ni bloquer la carte',
    tone: 'danger',
  }),
  spawn_failed: (p) => ({
    label: 'Lancement du worker en échec',
    detail: text(p['error']),
    tone: 'danger',
  }),
  gave_up: (p) => ({
    label: `Abandon après ${Number(p['failures'] ?? 0) || 'plusieurs'} échecs`,
    detail: text(p['error']),
    tone: 'danger',
  }),
  terminal_worker_reaped: () => ({ label: 'Worker résiduel arrêté' }),
  model_override_set: (p) => ({
    label: `Modèle forcé : ${text(p['model']) ?? '?'}`,
    detail: text(p['provider']),
  }),
  reasoning_effort_set: (p) => ({
    label: `Effort de raisonnement : ${text(p['reasoning_effort']) ?? '?'}`,
  }),
};

/**
 * Timeline des cartes d'une issue, dans l'ordre : événements du kanban et commentaires, textes masqués,
 * répétitions de tick fusionnées. Le profil d'un événement est celui de son run, sinon l'assigné de la carte.
 */
export function timelineOf(
  cardIds: readonly string[],
  events: readonly TaskEvent[],
  comments: readonly Comment[],
  runs: readonly Run[],
  assignees: ReadonlyMap<string, string | null>,
): TimelineItem[] {
  const cards = new Set(cardIds);
  const profileOfRun = new Map(runs.map((run) => [run.id, run.profile]));
  const items: TimelineItem[] = [];
  const counts = new Map<TimelineItem, number>();
  const lastRepeat = new Map<string, TimelineItem>();

  const ordered = events
    .filter((event) => cards.has(event.taskId))
    .sort((left, right) => left.createdAt - right.createdAt || left.id - right.id);
  for (const event of ordered) {
    const describe: Describe = DESCRIBE[event.kind] ?? (() => ({ label: event.kind }));
    const described = describe(event.payload);
    if (!described) continue;
    const repeatKey = `${event.taskId}:${event.kind}:${JSON.stringify(event.payload)}`;
    const previous = REPEATING.has(event.kind) ? lastRepeat.get(repeatKey) : undefined;
    if (previous) {
      counts.set(previous, (counts.get(previous) ?? 1) + 1);
      continue;
    }
    const item: TimelineItem = {
      id: `event:${event.id}`,
      at: event.createdAt,
      source: 'kanban',
      profile:
        (event.runId !== null ? profileOfRun.get(event.runId) : undefined) ??
        assignees.get(event.taskId) ??
        null,
      cardId: event.taskId,
      label: described.label,
      detail: clip(described.detail ?? null),
      tone: described.tone ?? 'neutral',
    };
    items.push(item);
    for (const key of lastRepeat.keys())
      if (key.startsWith(`${event.taskId}:`)) lastRepeat.delete(key);
    if (REPEATING.has(event.kind)) lastRepeat.set(repeatKey, item);
  }
  for (const [item, count] of counts) item.label = `${item.label} (${count} fois)`;

  for (const comment of comments) {
    if (!cards.has(comment.taskId)) continue;
    items.push({
      id: `comment:${comment.id}`,
      at: comment.createdAt,
      source: 'comment',
      profile: comment.author,
      cardId: comment.taskId,
      label: `Commentaire de ${comment.author}`,
      detail: clip(comment.body),
      tone: 'neutral',
    });
  }
  return items.sort((left, right) => left.at - right.at);
}
