/**
 * Inscrit le service worker de factory-live (app installée : coque hors ligne, notifications).
 * Une nouvelle version prend la main d'elle-même (`skipWaiting` dans `sw.ts`) : la page se recharge
 * une fois pour ne pas mélanger deux versions, sauf à la toute première installation.
 */
export function registerServiceWorker(
  nav: Navigator = navigator,
  reload = () => location.reload(),
): void {
  if (!('serviceWorker' in nav)) return;
  const hadController = Boolean(nav.serviceWorker.controller);
  let reloading = false;
  nav.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    reload();
  });
  void nav.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
    // Navigateur sans service worker utilisable (navigation privée) : l'app marche sans hors ligne ni push.
  });
}
