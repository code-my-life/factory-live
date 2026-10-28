/**
 * Ce que le service worker fait d'un push de factory-live, sans dépendre du navigateur : lecture du
 * message (titre, texte, page à ouvrir, étiquette, pastille) et options de la notification.
 * Forme envoyée par le serveur : `apps/server/src/application/notify.ts`.
 */
export interface PushMessage {
  title: string;
  body: string;
  /** Page de factory-live ouverte au toucher (une intervention). */
  url: string;
  /** Une notification par intervention : la suivante remplace la précédente. */
  tag: string | null;
  /** Interventions ouvertes, posées en pastille sur l'icône de l'app ; `null` si inconnu. */
  badge: number | null;
}

const FALLBACK: PushMessage = {
  title: 'factory-live',
  body: 'Un blocage t’attend.',
  url: '/interventions',
  tag: null,
  badge: null,
};

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

/** Une page de factory-live seulement : un push ne fait jamais quitter l'app. */
export function safeUrl(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : FALLBACK.url;
}

export function parsePush(raw: string | null | undefined): PushMessage {
  if (!raw) return FALLBACK;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ...FALLBACK, body: raw.slice(0, 180) };
  }
  const badge = Number(data['badge']);
  return {
    title: text(data['title'], FALLBACK.title),
    body: text(data['body'], ''),
    url: safeUrl(data['url']),
    tag: typeof data['tag'] === 'string' && data['tag'] ? data['tag'] : null,
    badge: Number.isInteger(badge) && badge >= 0 ? badge : null,
  };
}

export function notificationOptions(message: PushMessage): NotificationOptions {
  return {
    body: message.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    data: { url: message.url },
    ...(message.tag ? { tag: message.tag } : {}),
  };
}
