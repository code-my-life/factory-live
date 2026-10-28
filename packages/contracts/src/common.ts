import { z } from 'zod';

/** Horodatage ISO 8601 en UTC, tel qu'il circule dans l'API. */
export const Timestamp = z.iso.datetime();
export type Timestamp = z.infer<typeof Timestamp>;

/** Étapes de la ligne d'usine, dans l'ordre du parcours d'une issue. */
export const StationId = z.enum([
  'intake',
  'brief',
  'implementation',
  'gate',
  'release',
  'done',
  'stopped',
  'side',
]);
export type StationId = z.infer<typeof StationId>;

/** Statuts du kanban Hermès (colonnes du board). */
export const KanbanStatus = z.enum([
  'triage',
  'todo',
  'scheduled',
  'ready',
  'running',
  'blocked',
  'review',
  'done',
  'archived',
]);
export type KanbanStatus = z.infer<typeof KanbanStatus>;

/** Types de blocage du noyau kanban (`VALID_BLOCK_KINDS`), `null` quand le blocage n'est pas typé. */
export const BlockKind = z.enum(['dependency', 'needs_input', 'capability', 'transient']);
export type BlockKind = z.infer<typeof BlockKind>;

export const Severity = z.enum(['critical', 'warning', 'info']);
export type Severity = z.infer<typeof Severity>;

/** Clé d'issue lisible et stable : `<dépôt>#<numéro>`, par exemple `claude-cockpit#42`. */
export const IssueKey = z.string().regex(/^[\w.-]+#\d+$/);
export type IssueKey = z.infer<typeof IssueKey>;
