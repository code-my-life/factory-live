import { describe, expect, it, vi } from 'vitest';
import { registerServiceWorker } from './register.ts';

function navigatorWith(controller: object | null) {
  const listeners: (() => void)[] = [];
  const register = vi.fn(() => Promise.resolve({}));
  const nav = {
    serviceWorker: {
      controller,
      register,
      addEventListener: (_type: string, listener: () => void) => listeners.push(listener),
    },
  } as unknown as Navigator;
  return { nav, register, change: () => listeners.forEach((listener) => listener()) };
}

describe('registerServiceWorker', () => {
  it('inscrit le service worker sur toute l’app', () => {
    const { nav, register } = navigatorWith(null);
    registerServiceWorker(nav, vi.fn());
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('recharge une fois quand une nouvelle version prend la main, pas à la première installation', () => {
    const first = navigatorWith(null);
    const reloadFirst = vi.fn();
    registerServiceWorker(first.nav, reloadFirst);
    first.change();
    expect(reloadFirst).not.toHaveBeenCalled();

    const update = navigatorWith({});
    const reload = vi.fn();
    registerServiceWorker(update.nav, reload);
    update.change();
    update.change();
    expect(reload).toHaveBeenCalledOnce();
  });
});
