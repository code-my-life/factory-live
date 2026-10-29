import type { Text } from '@factory-live/contracts';
import type { I18n } from '../i18n/i18n.ts';

/**
 * Ce que le service worker fait d'un push de factory-live, sans dépendre du navigateur : lecture du
 * message (issue, titre, texte, page à ouvrir, étiquette, pastille), puis la notification écrite dans
 * la langue choisie sur l'appareil. Forme envoyée par le serveur : `PushPayload` des contrats
 * (`apps/server/src/application/notify.ts`) ; l'ancienne forme (titre et texte déjà écrits) reste lue.
 */
export interface PushMessage {
  /** Issue ou carte concernée, devant le titre ; `null` pour un push de test. */
  where: string | null;
  /** Texte de l'agent ou code de factory-live ; `null` : le nom de l'app. */
  title: Text | null;
  /** `null` : le texte de secours (« Un blocage t'attend. »). */
  body: Text | null;
  /** Page de factory-live ouverte au toucher (une intervention). */
  url: string;
  /** Une notification par intervention : la suivante remplace la précédente. */
  tag: string | null;
  /** Interventions ouvertes, posées en pastille sur l'icône de l'app ; `null` si inconnu. */
  badge: number | null;
}

const FALLBACK: PushMessage = {
  where: null,
  title: null,
  body: null,
  url: '/interventions',
  tag: null,
  badge: null,
};

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/** Un texte tel quel, ou un code de factory-live et ses paramètres (écrits par le dictionnaire). */
function text(value: unknown): Text | null {
  const plain = nonEmpty(value);
  if (plain !== null) return plain;
  if (typeof value !== 'object' || value === null) return null;
  const { code, params } = value as { code?: unknown; params?: unknown };
  return typeof code === 'string' && typeof params === 'object' && params !== null
    ? (value as Text)
    : null;
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
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
    where: nonEmpty(data['where']),
    title: text(data['title']),
    body: text(data['body']) ?? '',
    url: safeUrl(data['url']),
    tag: nonEmpty(data['tag']),
    badge: Number.isInteger(badge) && badge >= 0 ? badge : null,
  };
}

/** Le titre et le texte de la notification, dans la langue de l'appareil. */
export function notificationContent(
  message: PushMessage,
  { t, text: write }: I18n,
): { title: string; body: string } {
  const title = message.title === null ? 'factory-live' : write(message.title);
  return {
    title: clip(message.where ? t.common.labelValue(message.where, title) : title, 90),
    body: clip(message.body === null ? t.notification.fallbackBody : write(message.body), 180),
  };
}

export function notificationOptions(message: PushMessage, body: string): NotificationOptions {
  return {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    data: { url: message.url },
    ...(message.tag ? { tag: message.tag } : {}),
  };
}
