import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sans `globals` dans Vitest, Testing Library ne démonte rien seul : chaque test repart d'un DOM vide.
afterEach(() => {
  cleanup();
});
