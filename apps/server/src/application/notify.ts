import type { Intervention, Text } from '@factory-live/contracts';
import type { HistoryPort, LoggerPort, PushPort } from './ports.ts';

/** Au démarrage, une intervention plus ancienne n'est pas notifiée : Telegram l'a déjà signalée. */
const FRESH_MS = 6 * 3600_000;

export interface NotifyDeps {
  store: HistoryPort;
  notifier: PushPort;
  log: LoggerPort;
  now: () => number;
}

/** Un texte d'agent tient dans une notification ; un texte de factory-live (un code) passe tel quel. */
function clip(text: Text, max: number): Text {
  if (typeof text !== 'string') return text;
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/**
 * Ce que dit la notification : la cause et son mécanisme quand le diagnostic en trouve une, sinon (une
 * question, un blocage inexpliqué) la raison écrite par l'agent.
 */
function headline(intervention: Intervention): { title: Text; body: Text } {
  const primary = intervention.diagnosis?.primary;
  if (primary && primary.code !== 'question' && primary.code !== 'unexplained')
    return { title: primary.summary, body: primary.why };
  return { title: intervention.title, body: intervention.question };
}

/**
 * Une notification par intervention « push : oui », jamais deux, même après un redémarrage. Titre et
 * texte partent tels quels (texte de l'agent ou code de factory-live) : le service worker de chaque
 * appareil les écrit dans la langue qui y est choisie.
 */
export async function notifyOpened(
  deps: NotifyDeps,
  opened: readonly Intervention[],
  all: readonly Intervention[],
): Promise<void> {
  const now = deps.now();
  for (const intervention of opened) {
    if (!intervention.push) continue;
    if (!deps.store.claimNotification(intervention.id, now)) continue;
    if (now - Date.parse(intervention.openedAt) > FRESH_MS) continue;
    const { title, body } = headline(intervention);
    const result = await deps.notifier.notify({
      where: intervention.issueKey ?? intervention.cardId ?? 'factory',
      title: clip(title, 90),
      body: clip(body, 180),
      url: `/interventions/${encodeURIComponent(intervention.id)}`,
      tag: intervention.id,
      badge: all.filter(
        (item) => item.kind !== 'pr_approval' && item.kind !== 'main_red' && !item.resolvedAt,
      ).length,
    });
    deps.log.info(
      { component: 'push', interventionId: intervention.id, ...result },
      'notification envoyée',
    );
  }
}
