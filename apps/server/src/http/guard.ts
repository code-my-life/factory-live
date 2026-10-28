import type { MiddlewareHandler } from 'hono';

export interface GuardOptions {
  /** Origines de la PWA autorisées (localhost et nom tailnet). */
  origins: readonly string[];
  /** Logins Tailscale autorisés (`Tailscale-User-Login`). */
  tailscaleLogins: readonly string[];
  /** Nombre d'écritures par minute et par acteur. */
  perMinute?: number;
  now?: () => number;
}

export const CSRF_HEADER = 'x-factory-live';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function hostname(host: string | undefined): string {
  if (!host) return '';
  return host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : (host.split(':')[0] ?? '');
}

/**
 * Garde des écritures (déblocage, abonnement push) : sans mot de passe, comme décidé, mais réservée
 * à ce PC (requête locale, sans en-tête Tailscale) et au login Tailscale de Clément (en-tête posé par
 * `tailscale serve`, qui retire celui qu'enverrait un client). Origine contrôlée, en-tête anti-CSRF
 * obligatoire (un site tiers ne peut pas l'ajouter sans pré-vol CORS, jamais accepté), débit limité.
 */
export function writeGuard(
  options: GuardOptions,
): MiddlewareHandler<{ Variables: { actor: string } }> {
  const now = options.now ?? Date.now;
  const limit = options.perMinute ?? 30;
  const recent = new Map<string, number[]>();
  return async (c, next) => {
    const host = hostname(c.req.header('host'));
    const login = c.req.header('tailscale-user-login') ?? null;
    let actor: string;
    if (login) {
      if (!options.tailscaleLogins.includes(login))
        return c.json({ error: 'Login Tailscale non autorisé à écrire' }, 403);
      actor = `tailscale:${login}`;
    } else if (
      LOCAL_HOSTS.has(host) &&
      !c.req.header('x-forwarded-for') &&
      !c.req.header('x-forwarded-proto')
    ) {
      // Une requête passée par `tailscale serve` porte X-Forwarded-* : sans identité, elle n'est pas locale.
      actor = 'local';
    } else {
      return c.json({ error: 'Écriture réservée à ce PC et à ton login Tailscale' }, 403);
    }
    const origin = c.req.header('origin');
    if (origin && !options.origins.includes(origin))
      return c.json({ error: 'Origine refusée' }, 403);
    if (c.req.header(CSRF_HEADER) !== '1')
      return c.json({ error: 'En-tête x-factory-live manquant' }, 403);
    const times = (recent.get(actor) ?? []).filter((at) => now() - at < 60_000);
    if (times.length >= limit)
      return c.json({ error: 'Trop de demandes, réessaie dans une minute' }, 429);
    recent.set(actor, [...times, now()]);
    c.set('actor', actor);
    await next();
    return undefined;
  };
}
