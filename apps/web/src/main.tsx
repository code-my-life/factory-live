import '@primer/primitives/dist/css/primitives.css';
import '@primer/primitives/dist/css/functional/themes/dark.css';
import '@primer/primitives/dist/css/functional/themes/light.css';
import '@primer/primitives/dist/css/functional/motion/motion.css';
import '@primer/primitives/dist/css/base/motion/motion.css';
import '@xyflow/react/dist/base.css';
import './styles/tokens.css';
import './styles/global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';

if (import.meta.env.VITE_ARTIFACT === '1') {
  // Dans un artifact, l'hôte pose déjà les marges des zones sûres sur :root.
  document.documentElement.dataset.host = 'artifact';
}

const container = document.getElementById('root');
if (!container) throw new Error('Élément #root introuvable');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
