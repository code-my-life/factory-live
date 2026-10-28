import { createHmac, timingSafeEqual } from 'node:crypto';

/** Vérifie `sha256=<hex>` : HMAC-SHA256 du corps brut, comparé en temps constant (format d'Hermès et de la sonde). */
export function verifySignature(
  body: Uint8Array,
  header: string | undefined | null,
  secret: string,
): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const received = Buffer.from(header.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', secret).update(body).digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function sign(body: Uint8Array | string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

export type ReplayVerdict = 'fresh' | 'duplicate' | 'stale';

/**
 * Anti-rejeu : l'identifiant de livraison et l'horodatage sont dans le corps signé. Un doublon
 * (nouvel essai d'Hermès après un 5xx) est accepté sans être rejoué ; un envoi hors fenêtre est refusé.
 */
export class ReplayGuard {
  private readonly seen = new Map<string, number>();

  private readonly windowMs: number;
  private readonly futureMs: number;
  private readonly max: number;

  constructor(windowMs = 10 * 60_000, futureMs = 2 * 60_000, max = 20_000) {
    this.windowMs = windowMs;
    this.futureMs = futureMs;
    this.max = max;
  }

  check(deliveryId: string, sentAt: number, now: number): ReplayVerdict {
    if (!Number.isFinite(sentAt) || sentAt < now - this.windowMs || sentAt > now + this.futureMs)
      return 'stale';
    if (this.seen.has(deliveryId)) return 'duplicate';
    this.seen.set(deliveryId, now);
    if (this.seen.size > this.max) {
      for (const [id, at] of this.seen) {
        if (at >= now - this.windowMs && this.seen.size <= this.max) break;
        this.seen.delete(id);
      }
    }
    return 'fresh';
  }
}
