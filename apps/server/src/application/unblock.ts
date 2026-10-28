import type { Hub } from './hub.ts';
import type { GitHubWritePort, HistoryPort, LoggerPort, UnblockRecord } from './ports.ts';

export class UnblockError extends Error {
  readonly status: 404 | 409 | 502 | 503;

  constructor(status: 404 | 409 | 502 | 503, message: string) {
    super(message);
    this.status = status;
    this.name = 'UnblockError';
  }
}

export interface UnblockDeps {
  hub: Hub;
  store: HistoryPort;
  github: GitHubWritePort | null;
  log: LoggerPort;
  now: () => number;
}

/**
 * Répond à une intervention depuis l'app : commentaire `/factory unblock <réponse>` posté sur l'issue au
 * nom de Clément (son jeton). C'est le chemin existant de la factory, relais `active_pr` compris ; le bot
 * accuse réception par une réaction, puis la carte repart. Une deuxième demande ne reposte rien.
 */
export async function unblockIntervention(
  deps: UnblockDeps,
  interventionId: string,
  text: string,
  actor: string,
): Promise<UnblockRecord> {
  const intervention = deps.hub.openInterventions.find((item) => item.id === interventionId);
  if (!intervention) throw new UnblockError(404, 'Intervention inconnue ou déjà résolue');
  if (!intervention.issueKey || !intervention.actions.some((action) => action.kind === 'unblock')) {
    throw new UnblockError(
      409,
      'Cette intervention ne se débloque pas depuis l’app : utilise les commandes proposées',
    );
  }
  if (!deps.github)
    throw new UnblockError(
      503,
      'Aucun jeton GitHub : dépose-le dans ~/.config/factory-live/github-token',
    );
  const now = deps.now();
  const reserved = deps.store.reserveUnblock({
    interventionId,
    issueKey: intervention.issueKey,
    text,
    actor,
    state: 'sent',
    at: now,
  });
  if (!reserved) {
    const existing = deps.store.unblock(interventionId);
    if (existing) return existing;
  }
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
      `${intervention.issueKey} ${interventionId} → ${comment.url}`,
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
      const reactions = await deps.github.reactions(repo, record.commentId);
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
