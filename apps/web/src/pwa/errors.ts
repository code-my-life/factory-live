/**
 * Les erreurs du front remontent au serveur (`/api/client-logs`, journal de factory-live) : sur
 * iPhone, la console n'est pas sous la main. Cinq par minute au plus, une même erreur une fois.
 */
export function reportClientErrors(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
  send: typeof fetch = (input, init) => fetch(input, init),
  now: () => number = Date.now,
): () => void {
  const seen = new Map<string, number>();
  let windowStart = 0;
  let count = 0;
  const report = (message: string, stack: string | null) => {
    const at = now();
    if (at - windowStart > 60_000) {
      windowStart = at;
      count = 0;
    }
    const last = seen.get(message);
    if (count >= 5 || (last !== undefined && at - last < 60_000)) return;
    seen.set(message, at);
    count += 1;
    void send('/api/client-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        level: 'error',
        message: message.slice(0, 2000),
        stack: stack?.slice(0, 8000) ?? null,
        url: location.href.slice(0, 500),
        userAgent: navigator.userAgent.slice(0, 500),
        at: new Date(at).toISOString(),
      }),
    }).catch(() => undefined);
  };
  const onError = (event: Event) => {
    const error = event as ErrorEvent;
    report(
      error.message || String(error.error),
      error.error instanceof Error ? (error.error.stack ?? null) : null,
    );
  };
  const onRejection = (event: Event) => {
    const reason: unknown = (event as PromiseRejectionEvent).reason;
    report(
      reason instanceof Error ? reason.message : String(reason),
      reason instanceof Error ? (reason.stack ?? null) : null,
    );
  };
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
