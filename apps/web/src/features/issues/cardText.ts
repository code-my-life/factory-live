import type { CardView, KanbanStatus, RunRole } from '@factory-live/contracts';

export const CARD_STATUS_LABEL: Record<KanbanStatus, string> = {
  triage: 'Triage',
  todo: 'En attente',
  scheduled: 'Planifiée',
  ready: 'Prête',
  running: 'En cours',
  blocked: 'Bloquée',
  review: 'En revue',
  done: 'Terminée',
  archived: 'Archivée',
};

export const RUN_ROLE_LABEL: Record<RunRole, string> = {
  coordinator: 'coordination',
  implementer: 'implémentation',
  reviewer: 'revue',
  release: 'release',
  other: 'autre',
};

/** « impl claude-cockpit#71 : regrouper… » → « regrouper… » : le nœud affiche déjà l'issue et le type. */
export function shortCardTitle(card: CardView): string {
  const stripped = card.title.replace(/^(impl|release|brief)?\s*[\w.-]+#\d+\s*:?\s*/i, '').trim();
  if (stripped) return stripped;
  return card.kind === 'release' ? 'Merge, tag et surveillance de main' : card.title;
}
