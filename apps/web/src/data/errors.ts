import type { ApiErrorCode } from '@factory-live/contracts';
import type { Messages } from '../i18n/fr.ts';

/** Ce que l'interface a tenté quand une action échoue : de quoi l'écrire dans la langue choisie. */
export type FailedAction = keyof Messages['errors']['action'];

/**
 * Une action refusée (déblocage, notifications, déconnexion) : le texte se compose à l'affichage,
 * dans la langue de l'interface, à partir du code d'erreur de l'API, sinon de l'action et du statut HTTP.
 */
export class ActionError extends Error {
  readonly action: FailedAction;
  readonly status: number | null;
  readonly code: ApiErrorCode | null;

  constructor(
    action: FailedAction,
    status: number | null = null,
    code: ApiErrorCode | null = null,
  ) {
    super(code ?? (status === null ? action : `${action} (HTTP ${status})`));
    this.name = 'ActionError';
    this.action = action;
    this.status = status;
    this.code = code;
  }
}

/** Le refus d'une écriture, lu dans la réponse de l'API (`{ error, code }`). */
export async function refusal(response: Response, action: FailedAction): Promise<ActionError> {
  const body = (await response.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === 'string' ? (body.code as ApiErrorCode) : null;
  return new ActionError(action, response.status, code);
}

/** Le texte d'un échec, dans la langue de l'interface ; une autre erreur garde son message. */
export function describeError(error: unknown, t: Messages): string {
  if (error instanceof ActionError) {
    // Un code inconnu (serveur plus récent que la page) retombe sur l'action et le statut.
    const known = error.code ? (t.errors.api[error.code] as string | undefined) : undefined;
    if (known) return known;
    const what = t.errors.action[error.action];
    return error.status === null ? what : t.errors.http(what, error.status);
  }
  return error instanceof Error ? error.message : String(error);
}
