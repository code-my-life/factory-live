import { defaultClientConditions, defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

// Les paquets du monorepo sont résolus sur leurs sources TypeScript (condition `source`).
const sourceFirst = {
  resolve: { conditions: ['source', ...defaultClientConditions] },
  ssr: { resolve: { conditions: ['source', ...defaultServerConditions] } },
};

export default defineConfig({
  test: {
    // Le serveur reçoit ses tests en phase 4 ; d'ici là, un projet vide ne doit pas faire échouer la suite.
    passWithNoTests: true,
    projects: [
      {
        ...sourceFirst,
        test: {
          name: 'domain',
          include: ['packages/domain/src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        ...sourceFirst,
        test: {
          name: 'contracts',
          include: ['packages/contracts/src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        ...sourceFirst,
        test: { name: 'server', include: ['apps/server/src/**/*.test.ts'], environment: 'node' },
      },
      'apps/web/vitest.config.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'apps/*/src/**'],
      exclude: ['**/*.test.*', '**/*.test-helpers.ts', 'apps/web/src/test/**'],
      // Règles métier : seuil vérifié à chaque `npm run verify` (plan, phase 3).
      thresholds: {
        'packages/domain/src/**': { lines: 95, statements: 95, functions: 90, branches: 80 },
      },
    },
  },
});
