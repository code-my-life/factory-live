import { describe, expect, it, vi } from 'vitest';
import { ActionError, describeError } from '../data/errors.ts';
import { en } from '../i18n/en.ts';
import { fr } from '../i18n/fr.ts';
import {
  deviceLabel,
  disablePush,
  enablePush,
  keyBytes,
  pushAvailability,
  sendTestPush,
} from './push.ts';
import type { PushEnv } from './push.ts';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const WINDOWS_EDGE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0';

interface EnvOptions {
  agent?: string;
  standalone?: boolean;
  permission?: NotificationPermission;
  granted?: NotificationPermission;
  push?: boolean;
  existing?: PushSubscription | null;
}

function urlOf(input: string | URL | Request): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

function env({
  agent = WINDOWS_EDGE,
  standalone = false,
  permission = 'default',
  granted = 'granted',
  push = true,
  existing = null,
}: EnvOptions = {}) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const unsubscribe = vi.fn(() => Promise.resolve(true));
  const subscription = {
    endpoint: 'https://push.example/abc',
    unsubscribe,
    toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } }),
  } as unknown as PushSubscription;
  const subscribe = vi.fn(() => Promise.resolve(subscription));
  const registration = {
    pushManager: { getSubscription: () => Promise.resolve(existing), subscribe },
  };
  const value: PushEnv = {
    navigator: {
      userAgent: agent,
      platform: agent.includes('iPhone') ? 'iPhone' : 'Win32',
      maxTouchPoints: agent.includes('iPhone') ? 5 : 0,
      standalone,
      serviceWorker: {
        ready: Promise.resolve(registration),
        getRegistration: () => Promise.resolve(registration),
      },
    } as unknown as Navigator,
    window: {
      ...(push ? { PushManager: class {} } : {}),
      Notification: { permission, requestPermission: () => Promise.resolve(granted) },
      matchMedia: () => ({ matches: standalone }),
    },
    fetch: (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: urlOf(input), init });
      const body = urlOf(input).endsWith('/api/push/key') ? { publicKey: 'AQID' } : {};
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    },
  };
  return { value, calls, subscribe, unsubscribe };
}

describe('pushAvailability', () => {
  it('sur iPhone, demande d’installer l’app d’abord : Safari seul ne reçoit pas de push', () => {
    expect(pushAvailability(env({ agent: IPHONE, push: false }).value)).toBe('install-first');
    expect(pushAvailability(env({ agent: IPHONE, standalone: true }).value)).toBe('available');
  });

  it('dit quand les notifications sont refusées ou impossibles', () => {
    expect(pushAvailability(env({ permission: 'denied' }).value)).toBe('denied');
    expect(pushAvailability(env({ push: false }).value)).toBe('unsupported');
    expect(pushAvailability(env().value)).toBe('available');
  });
});

describe('abonnement', () => {
  it('demande la permission, s’abonne avec la clé du serveur et l’enregistre avec l’en-tête anti-CSRF', async () => {
    const { value, calls, subscribe } = env();
    await enablePush(value);
    expect(subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([1, 2, 3]),
    });
    const post = calls.find((call) => call.url === '/api/push/subscribe');
    expect(new Headers(post?.init?.headers).get('x-factory-live')).toBe('1');
    expect(JSON.parse(post?.init?.body as string)).toEqual({
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'p', auth: 'a' },
      device: 'Windows, Edge',
    });
  });

  it('s’arrête net si la permission est refusée', async () => {
    const { value, subscribe } = env({ granted: 'denied' });
    const refused = await enablePush(value).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(ActionError);
    expect(describeError(refused, fr)).toMatch(/^Notifications refusées/);
    expect(describeError(refused, en)).toMatch(/^Notifications blocked/);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('se désabonne sur l’appareil et chez factory-live, puis demande un test au serveur', async () => {
    const unsubscribe = vi.fn(() => Promise.resolve(true));
    const subscription = {
      endpoint: 'https://push.example/abc',
      unsubscribe,
    } as unknown as PushSubscription;
    const { value, calls } = env({ existing: subscription });
    await disablePush(value);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(calls.find((call) => call.url === '/api/push/unsubscribe')?.init?.body).toBe(
      JSON.stringify({ endpoint: 'https://push.example/abc' }),
    );
    await sendTestPush(value);
    expect(calls.at(-1)?.url).toBe('/api/push/test');
  });
});

describe('outils', () => {
  it('décode la clé VAPID en base64url et nomme l’appareil', () => {
    expect([...keyBytes('-_8')]).toEqual([251, 255]);
    expect(
      deviceLabel({ userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 } as Navigator),
    ).toBe('iPhone, Safari');
  });
});
