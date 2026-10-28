import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// `source` résout les paquets du monorepo sur leurs sources TypeScript (voir les `exports`).
// FACTORY_LIVE_BASE=./ produit un build relocalisable, publiable tel quel en artifact.
const artifact = process.env.VITE_ARTIFACT === '1';

export default defineConfig({
  base: process.env.FACTORY_LIVE_BASE ?? '/',
  plugins: [
    react(),
    // PWA installable (iPhone, PC, Mac) : manifeste, icônes, service worker maison pour les push.
    // Pas dans un artifact : l'hôte n'y permet pas de service worker.
    VitePWA({
      disable: artifact,
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'sw.ts',
      injectRegister: false,
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon-180.png'],
      manifest: {
        id: '/',
        name: 'factory-live',
        short_name: 'factory-live',
        description: 'La factory Hermès en temps réel : ligne d’usine, agents, interventions.',
        lang: 'fr',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0d1117',
        theme_color: '#0d1117',
        categories: ['developer', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
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
