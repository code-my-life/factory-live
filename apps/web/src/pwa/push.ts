import { ActionError, refusal } from '../data/errors.ts';

/**
 * Notifications de cet appareil : abonnement Web Push du navigateur (service worker), enregistré
 * auprès de factory-live, qui n'envoie un push que pour un blocage qui attend Clément.
 * Sur iPhone et iPad, Web Push n'existe que dans l'app installée sur l'écran d'accueil.
 */
export type PushAvailability = 'available' | 'install-first' | 'denied' | 'unsupported';

export interface PushEnv {
  navigator: Navigator;
  window: {
    PushManager?: unknown;
    Notification?: {
      permission: NotificationPermission;
      requestPermission(): Promise<NotificationPermission>;
    };
    matchMedia?: (query: string) => { matches: boolean };
  };
  fetch: typeof fetch;
}

function browserEnv(): PushEnv {
  return {
    navigator,
    window,
    fetch: (input, init) => fetch(input, init),
  };
}

function appleTouch(nav: Navigator): boolean {
  return (
    /iPhone|iPad|iPod/.test(nav.userAgent) ||
    (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  );
}

function installed(env: PushEnv): boolean {
  return (
    env.window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (env.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function pushAvailability(env: PushEnv = browserEnv()): PushAvailability {
  if (appleTouch(env.navigator) && !installed(env)) return 'install-first';
  if (!('serviceWorker' in env.navigator) || !env.window.PushManager || !env.window.Notification)
    return 'unsupported';
  if (env.window.Notification.permission === 'denied') return 'denied';
  return 'available';
}

/** Nom de l'appareil, gardé avec l'abonnement pour s'y retrouver côté serveur. */
export function deviceLabel(nav: Navigator): string {
  const agent = nav.userAgent;
  const device = /iPhone/.test(agent)
    ? 'iPhone'
    : /iPad/.test(agent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
      ? 'iPad'
      : /Android/.test(agent)
        ? 'Android'
        : /Mac OS X/.test(agent)
          ? 'Mac'
          : /Windows/.test(agent)
            ? 'Windows'
            : 'Linux';
  const browser = /Edg\//.test(agent)
    ? 'Edge'
    : /Firefox\//.test(agent)
      ? 'Firefox'
      : /Chrome\//.test(agent)
        ? 'Chrome'
        : 'Safari';
  return `${device}, ${browser}`;
}

/** Clé VAPID en base64url vers les octets qu'attend `PushManager.subscribe`. */
export function keyBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`
    .replaceAll('-', '+')
    .replaceAll('_', '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

const WRITE_HEADERS = { 'Content-Type': 'application/json', 'X-Factory-Live': '1' };

export async function pushSubscribed(env: PushEnv = browserEnv()): Promise<boolean> {
  if (!('serviceWorker' in env.navigator)) return false;
  const registration = await env.navigator.serviceWorker.getRegistration();
  return Boolean(await registration?.pushManager.getSubscription());
}

/** À appeler depuis un toucher : iOS ne demande la permission que sur un geste de l'utilisateur. */
export async function enablePush(env: PushEnv = browserEnv()): Promise<void> {
  const permission = await env.window.Notification?.requestPermission();
  if (permission !== 'granted')
    throw new ActionError(permission === 'denied' ? 'pushDenied' : 'pushNotAllowed');
  const keyResponse = await env.fetch('/api/push/key', { headers: { Accept: 'application/json' } });
  if (!keyResponse.ok) throw await refusal(keyResponse, 'pushKey');
  const { publicKey } = (await keyResponse.json()) as { publicKey: string };
  const registration = await env.navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    }));
  const { endpoint, keys } = subscription.toJSON();
  const response = await env.fetch('/api/push/subscribe', {
    method: 'POST',
    headers: WRITE_HEADERS,
    body: JSON.stringify({ endpoint, keys, device: deviceLabel(env.navigator) }),
  });
  if (!response.ok) throw await refusal(response, 'pushSubscribe');
}

export async function disablePush(env: PushEnv = browserEnv()): Promise<void> {
  const registration = await env.navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const { endpoint } = subscription;
  await subscription.unsubscribe();
  const response = await env.fetch('/api/push/unsubscribe', {
    method: 'POST',
    headers: WRITE_HEADERS,
    body: JSON.stringify({ endpoint }),
  });
  if (!response.ok) throw await refusal(response, 'pushUnsubscribe');
}

/** Demande au serveur un push de test vers tous les appareils abonnés. */
export async function sendTestPush(env: PushEnv = browserEnv()): Promise<void> {
  const response = await env.fetch('/api/push/test', { method: 'POST', headers: WRITE_HEADERS });
  if (!response.ok) throw await refusal(response, 'pushTest');
}
