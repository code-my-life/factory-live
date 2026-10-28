/** La pastille de l'icône de l'app installée : les blocages qui t'attendent (même règle que les push). */
export function setAppBadge(count: number, nav: Navigator = navigator): void {
  const badging = nav as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  const done = count > 0 ? badging.setAppBadge?.(count) : badging.clearAppBadge?.();
  void done?.catch(() => undefined);
}
