import webpush from 'web-push';
import type { PushMessage, PushPort } from '../../application/ports.ts';
import type { HistoryStore, StoredSubscription } from '../store/history.ts';

export type { PushMessage };

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

type Send = (
  subscription: StoredSubscription,
  payload: string,
  keys: VapidKeys,
  subject: string,
) => Promise<unknown>;

const defaultSend: Send = (subscription, payload, keys, subject) =>
  webpush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, payload, {
    vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
    TTL: 6 * 3600,
    urgency: 'high',
    timeout: 10_000,
  });

/** Clés VAPID créées au premier démarrage et gardées dans la base de factory-live (volume privé). */
export function vapidKeys(store: HistoryStore): VapidKeys {
  const saved = store.meta('vapid');
  if (saved) return JSON.parse(saved) as VapidKeys;
  const keys = webpush.generateVAPIDKeys();
  store.setMeta('vapid', JSON.stringify(keys));
  return keys;
}

/**
 * Envoi Web Push à tous les appareils abonnés (localhost et URL tailnet sont deux origines, donc deux
 * abonnements par appareil au plus). Un abonnement expiré (404, 410) est oublié.
 */
export class PushNotifier implements PushPort {
  private readonly store: HistoryStore;
  private readonly keys: VapidKeys;
  private readonly subject: string;
  private readonly send: Send;

  constructor(store: HistoryStore, keys: VapidKeys, subject: string, send: Send = defaultSend) {
    this.store = store;
    this.keys = keys;
    this.subject = subject;
    this.send = send;
  }

  get publicKey(): string {
    return this.keys.publicKey;
  }

  async notify(message: PushMessage): Promise<{ sent: number; removed: number; failed: number }> {
    const payload = JSON.stringify(message);
    let sent = 0;
    let removed = 0;
    let failed = 0;
    await Promise.all(
      this.store.subscriptions().map(async (subscription) => {
        try {
          await this.send(subscription, payload, this.keys, this.subject);
          sent += 1;
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            this.store.removeSubscription(subscription.endpoint);
            removed += 1;
          } else {
            failed += 1;
          }
        }
      }),
    );
    return { sent, removed, failed };
  }
}
