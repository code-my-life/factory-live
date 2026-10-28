import react from '@vitejs/plugin-react';
import { defaultClientConditions } from 'vite';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [react()],
  resolve: { conditions: ['source', ...defaultClientConditions] },
  test: {
    name: 'web',
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    // Primer importe ses feuilles de style depuis son JavaScript : Vite doit le transformer lui-même.
    server: { deps: { inline: [/@primer\/react/] } },
  },
});
