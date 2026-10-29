import type { Messages } from '../i18n/fr.ts';

/** Ce que l'interface a tenté quand une action échoue : de quoi l'écrire dans la langue choisie. */
export type FailedAction = keyof Messages['errors']['action'];

/**
 * Une action refusée (déblocage, notifications, déconnexion) : le texte se compose à l'affichage,
 * dans la langue de l'interface, à partir de l'action et du statut HTTP.
 */
export class ActionError extends Error {
  readonly action: FailedAction;
  readonly status: number | null;

  constructor(action: FailedAction, status: number | null = null) {
    super(status === null ? action : `${action} (HTTP ${status})`);
    this.name = 'ActionError';
    this.action = action;
    this.status = status;
  }
}

/** Le texte d'un échec, dans la langue de l'interface ; une autre erreur garde son message. */
export function describeError(error: unknown, t: Messages): string {
  if (error instanceof ActionError) {
    const what = t.errors.action[error.action];
    return error.status === null ? what : t.errors.http(what, error.status);
  }
  return error instanceof Error ? error.message : String(error);
}
