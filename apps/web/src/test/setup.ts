import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom n'a pas `matchMedia`, que lisent Primer (Spinner) et nos préférences d'animation : aucune
// requête média ne correspond, comme sur un écran sans préférence particulière.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

// Sans `globals` dans Vitest, Testing Library ne démonte rien seul : chaque test repart d'un DOM vide.
afterEach(() => {
  cleanup();
});
