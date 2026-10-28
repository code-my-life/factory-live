import type { Intervention } from '@factory-live/contracts';
import type { HistoryPort, LoggerPort, PushPort } from './ports.ts';

/** Au démarrage, une intervention plus ancienne n'est pas notifiée : Telegram l'a déjà signalée. */
const FRESH_MS = 6 * 3600_000;

export interface NotifyDeps {
  store: HistoryPort;
  notifier: PushPort;
  log: LoggerPort;
  now: () => number;
}

function clip(text: string, max: number): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** Une notification par intervention « push : oui », jamais deux, même après un redémarrage. */
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
    const where = intervention.issueKey ?? intervention.cardId ?? 'factory';
    const result = await deps.notifier.notify({
      title: clip(`${where} : ${intervention.title}`, 90),
      body: clip(intervention.question, 180),
      url: `/interventions/${encodeURIComponent(intervention.id)}`,
      tag: intervention.id,
      badge: all.filter((item) => item.kind !== 'pr_approval' && item.kind !== 'main_red').length,
    });
    deps.log.info(
      { component: 'push', interventionId: intervention.id, ...result },
      'notification envoyée',
    );
  }
}
