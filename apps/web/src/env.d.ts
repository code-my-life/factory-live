/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `demo` : scénario rejoué sans serveur (maquette, e2e) ; `live` : API de factory-live. */
  readonly VITE_DATA_SOURCE?: 'demo' | 'live';
  /** `memory` pour un hébergement sans URL maîtrisée (artifact), `browser` sinon. */
  readonly VITE_ROUTER?: 'browser' | 'memory';
  /** `1` quand la page est publiée en artifact : les marges de sécurité sont déjà posées par l'hôte. */
  readonly VITE_ARTIFACT?: '1';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
