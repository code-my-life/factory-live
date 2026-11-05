import { msg } from '@factory-live/contracts';
import type { NotifyDeps } from './notify.ts';
import type { WorkflowView } from './ports.ts';

/** The stations of a workflow where the owner works, with their names. */
function ownerStations(workflow: WorkflowView): Map<string, string> {
  return new Map(
    (workflow.sheet?.stations ?? [])
      .filter((station) => station.kind === 'owner')
      .map((station) => [station.key, station.label]),
  );
}

/** The items of a workflow that wait for the owner, as the app's badge counts them. */
export function waitingForOwner(workflow: WorkflowView): WorkflowView['items'] {
  const owners = ownerStations(workflow);
  return workflow.items.filter((item) => item.state === 'waiting' && owners.has(item.station));
}

/** An arrival older than this is not news: a server that restarts does not notify the past again. */
const FRESH_MS = 6 * 3600_000;

/**
 * The items of a workflow that just reached a station waiting for the owner (#31): one push each, once
 * per arrival. An arrival is the item, its station and when it got there: the same video sent back to
 * the same station later is a new arrival. The claim is kept in the store, so a restart notifies
 * nothing twice.
 */
export async function notifyArrivals(
  deps: NotifyDeps,
  workflow: WorkflowView,
  /** What else waits for the owner (the factory's interventions): the app's badge counts it too. */
  alsoWaiting = 0,
): Promise<number> {
  const { sheet } = workflow;
  if (!sheet) return 0;
  const owners = ownerStations(workflow);
  const now = deps.now();
  const waiting = waitingForOwner(workflow);
  let sent = 0;
  for (const item of waiting) {
    if (now - Date.parse(item.since) > FRESH_MS) continue;
    const key = `${workflow.name}:${item.id}:${item.station}:${item.since}`;
    if (!deps.store.claimNotification(key, now)) continue;
    const result = await deps.notifier.notify({
      where: `${workflow.name}:${item.id}`,
      title: msg('push.studio.title', { station: owners.get(item.station) ?? item.station }),
      body: item.title,
      url: `/${workflow.name}/${encodeURIComponent(item.id)}`,
      tag: key,
      badge: waiting.length + alsoWaiting,
    });
    sent += 1;
    deps.log.info(
      { component: 'push', workflow: workflow.name, item: item.id, ...result },
      'notification envoyée',
    );
  }
  return sent;
}
