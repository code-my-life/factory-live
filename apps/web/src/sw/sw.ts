/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { notificationOptions, parsePush, safeUrl } from './notification.ts';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | { url: string; revision: string | null })[];
};

/*
 * Service worker de factory-live : la coque de l'app (HTML, JS, CSS, icônes) reste disponible hors
 * ligne, l'API ne passe jamais par le cache (le flux SSE et les écritures vont toujours au serveur),
 * et les push du serveur deviennent des notifications avec la pastille de l'icône.
 * Une nouvelle version prend la main tout de suite ; la page se recharge alors (`pwa/register.ts`).
 */
void self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }),
);

async function setBadge(count: number | null): Promise<void> {
  const navigator = self.navigator as WorkerNavigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (count === null) return;
  try {
    if (count > 0) await navigator.setAppBadge?.(count);
    else await navigator.clearAppBadge?.();
  } catch {
    // Pastille refusée (permission, plateforme) : la notification suffit.
  }
}

self.addEventListener('push', (event) => {
  const message = parsePush(event.data?.text());
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(message.title, notificationOptions(message)),
      setBadge(message.badge),
    ]),
  );
});

/** Au toucher : l'app déjà ouverte passe devant et va à l'intervention ; sinon elle s'ouvre dessus. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safeUrl((event.notification.data as { url?: unknown } | null)?.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        await open.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
