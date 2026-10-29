import '@primer/primitives/dist/css/primitives.css';
import '@primer/primitives/dist/css/functional/themes/dark.css';
import '@primer/primitives/dist/css/functional/themes/light.css';
import '@primer/primitives/dist/css/functional/motion/motion.css';
import '@primer/primitives/dist/css/base/motion/motion.css';
import './styles/tokens.css';
import './styles/global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { reportClientErrors } from './pwa/errors.ts';
import { registerServiceWorker } from './pwa/register.ts';
import { declareMonaSans } from './styles/fonts.ts';

declareMonaSans();

if (import.meta.env.VITE_ARTIFACT === '1') {
  // Dans un artifact, l'hôte pose déjà les marges des zones sûres sur :root.
  document.documentElement.dataset.host = 'artifact';
} else if (import.meta.env.PROD && import.meta.env.VITE_DATA_SOURCE === 'live') {
  // L'app servie par factory-live : installable, notifications, erreurs du front remontées au serveur.
  registerServiceWorker();
  reportClientErrors();
}

const container = document.getElementById('root');
if (!container) throw new Error('Élément #root introuvable');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
