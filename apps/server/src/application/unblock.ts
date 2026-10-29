import type { ApiErrorCode } from '@factory-live/contracts';
import type { Hub } from './hub.ts';
import type { GitHubWritePort, HistoryPort, LoggerPort, UnblockRecord } from './ports.ts';

export class UnblockError extends Error {
  readonly status: 404 | 409 | 502 | 503;
  /** Ce que la PWA écrit dans sa langue ; le message reste pour les journaux. */
  readonly code: ApiErrorCode;

  constructor(status: 404 | 409 | 502 | 503, code: ApiErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'UnblockError';
  }
}

export interface UnblockDeps {
  hub: Hub;
  store: HistoryPort;
  github: GitHubWritePort | null;
  /** Faux tant que Clément n'est pas connecté à GitHub (et sans jeton de repli). */
  canWrite?: () => boolean;
  /**
   * Login du bot de la factory : seule sa réaction au commentaire compte, n'importe qui pouvant réagir
   * sur un dépôt public.
   */
  factoryBot: string;
  log: LoggerPort;
  now: () => number;
}

/**
 * Répond à une intervention depuis l'app : commentaire `/factory unblock <réponse>` posté sur l'issue au
 * nom de Clément (son jeton). C'est le chemin existant de la factory, relais `active_pr` compris ; le bot
 * accuse réception par une réaction, puis la carte repart. Une deuxième demande ne reposte rien, sauf
 * après un refus du bot. Tant que le diagnostic voit la cause encore présente côté factory, il faut
 * `acknowledgeCause` : la carte retomberait dans le même échec, et le 2e blocage l'envoie en triage.
 */
export async function unblockIntervention(
  deps: UnblockDeps,
  interventionId: string,
  text: string,
  actor: string,
  acknowledgeCause = false,
): Promise<UnblockRecord> {
  const intervention = deps.hub.openInterventions.find((item) => item.id === interventionId);
  if (!intervention)
    throw new UnblockError(404, 'intervention_unknown', 'Intervention inconnue ou déjà résolue');
  if (!intervention.issueKey || !intervention.actions.some((action) => action.kind === 'unblock')) {
    throw new UnblockError(
      409,
      'unblock_not_available',
      'Cette intervention ne se débloque pas depuis l’app : utilise les commandes proposées',
    );
  }
  if (!deps.github || (deps.canWrite && !deps.canWrite())) {
    throw new UnblockError(
      503,
      'github_login_required',
      'Connecte-toi à GitHub dans factory-live (Réglages) pour débloquer depuis l’app',
    );
  }
  const primary = intervention.diagnosis?.primary ?? null;
  const causePresent = intervention.diagnosis?.unblock.when === 'after_fix';
  if (causePresent && !acknowledgeCause) {
    deps.store.audit(
      actor,
      'unblock-refused',
      `${intervention.issueKey} ${interventionId} : cause présente (${primary?.code ?? '?'})`,
      deps.now(),
    );
    throw new UnblockError(
      409,
      'cause_present',
      'La cause du blocage est encore là côté factory : corrige-la, ou débloque quand même',
    );
  }
  const now = deps.now();
  const reservation = {
    interventionId,
    issueKey: intervention.issueKey,
    text,
    actor,
    state: 'sent' as const,
    at: now,
  };
  if (!deps.store.reserveUnblock(reservation)) {
    const existing = deps.store.unblock(interventionId);
    // Une réponse refusée par le bot (😕) peut être renvoyée, corrigée.
    if (existing?.state === 'rejected') {
      deps.store.forgetUnblock(interventionId);
      deps.store.reserveUnblock(reservation);
    } else if (existing) return existing;
  }
  const cause = primary
    ? ` [cause ${primary.code} : ${causePresent ? 'présente, déblocage voulu' : primary.cause.state}]`
    : '';
  const [repo = '', number = '0'] = intervention.issueKey.split('#');
  try {
    const comment = await deps.github.comment(repo, Number(number), `/factory unblock ${text}`);
    deps.store.updateUnblock(
      interventionId,
      { state: 'sent', commentId: comment.id, commentUrl: comment.url },
      deps.now(),
    );
    deps.store.audit(
      actor,
      'unblock',
      `${intervention.issueKey} ${interventionId} → ${comment.url}${cause}`,
      deps.now(),
    );
    deps.log.info(
      { component: 'unblock', issue: intervention.issueKey, interventionId, actor },
      'déblocage posté sur l’issue',
    );
  } catch (error) {
    deps.store.forgetUnblock(interventionId);
    deps.store.audit(
      actor,
      'unblock-failed',
      `${intervention.issueKey} ${interventionId} : ${String(error)}`,
      deps.now(),
    );
    deps.log.error(
      { component: 'unblock', issue: intervention.issueKey, error: String(error) },
      'commentaire de déblocage refusé par GitHub',
    );
    throw new UnblockError(
      502,
      'github_refused',
      'GitHub a refusé le commentaire : réessaie, ou réponds sur l’issue',
    );
  }
  deps.hub.unblockChanged();
  return deps.store.unblock(interventionId) as UnblockRecord;
}

/** Suit les réactions du bot sur les commentaires postés : 👍 accepté, 😕 rien à débloquer. */
export async function trackUnblockReactions(deps: UnblockDeps): Promise<void> {
  if (!deps.github) return;
  let changed = false;
  for (const record of deps.store.openUnblocks()) {
    if (record.state !== 'sent' || record.commentId === null) continue;
    const [repo = ''] = record.issueKey.split('#');
    try {
      const bot = deps.factoryBot.toLowerCase();
      const reactions = (await deps.github.reactions(repo, record.commentId)).filter(
        (reaction) => reaction.user.toLowerCase() === bot,
      );
      const state = reactions.some((reaction) => reaction.content === 'confused')
        ? 'rejected'
        : reactions.some((reaction) => reaction.content === '+1')
          ? 'acknowledged'
          : null;
      if (state) {
        deps.store.updateUnblock(record.interventionId, { state }, deps.now());
        changed = true;
      }
    } catch (error) {
      deps.log.debug({ component: 'unblock', error: String(error) }, 'réactions illisibles');
    }
  }
  if (changed) deps.hub.unblockChanged();
}
