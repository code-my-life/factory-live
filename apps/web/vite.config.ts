import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

// `source` résout les paquets du monorepo sur leurs sources TypeScript (voir les `exports`).
// FACTORY_LIVE_BASE=./ produit un build relocalisable, publiable tel quel en artifact.
export default defineConfig({
  base: process.env.FACTORY_LIVE_BASE ?? '/',
  plugins: [react()],
  resolve: { conditions: ['source', ...defaultClientConditions] },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8446' },
  },
  build: {
    outDir: process.env.FACTORY_LIVE_OUT_DIR ?? 'dist',
    sourcemap: process.env.FACTORY_LIVE_SOURCEMAP !== '0',
    target: 'es2023',
  },
});
