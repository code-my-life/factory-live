# AGENTS.md

Règles et commandes de factory-live, pour les agents de la factory Hermès comme pour Claude Code. À lire avant toute modification.

## Ce que fait ce dépôt

factory-live montre en temps réel la factory Hermès (dépôt `code-my-life/hermes-software-factory`) : ligne d'usine, graphe des cartes de chaque issue, profil et modèle réellement utilisés, action en cours, transcription intégrale, interventions avec déblocage, santé, coûts, historique. PWA (web, desktop, iPhone) servie par un conteneur Docker.

## Commandes

| Besoin              | Commande                                                                |
| ------------------- | ----------------------------------------------------------------------- |
| Installer           | `npm ci` (Node 24.15 ou plus ; l'image Docker utilise 24.22.1)          |
| Tout vérifier, vite | `npm run verify:fast` : format, lint, types, texte, architecture, tests |
| Tout vérifier       | `npm run verify` : la même chose plus le build                          |
| Front sur la démo   | `npm run dev:web` puis http://127.0.0.1:5173                            |
| Serveur (dev)       | `npm run dev:server` : lit `~/.hermes` en lecture seule, port 8446      |
| Conteneur           | `docker compose -f docker/compose.yaml up -d --build` (voir RUNBOOK)    |
| Tests seuls         | `npm test` ; couverture : `npm run test:coverage`                       |
| Formater            | `npm run format`                                                        |

La CI (GitHub Actions) lance `npm run verify` sur Node 24 et 26. Une PR n'est prête que si la CI est verte.

## Architecture (vérifiée par `npm run check:arch`)

- `packages/domain` : règles pures (stations, interventions, modèle effectif). Ne dépend de rien.
- `packages/contracts` : schémas zod de l'API, de l'ingestion et du flux SSE. Ne dépend que de zod.
- `apps/server` : cas d'usage (`application/`) qui ne connaissent que des ports ; adaptateurs (`adapters/`) qui les implémentent ; HTTP (`http/`).
- `apps/web` : PWA React + Primer + React Flow. Ne connaît que `contracts`.

Détails : `docs/ARCHITECTURE.md`. Exploitation : `docs/RUNBOOK.md`. Décisions : `docs/decisions/`.

## Règles de code

- TypeScript strict. Imports relatifs avec l'extension `.ts` ou `.tsx`. Identifiants en anglais, textes d'interface et docs en français.
- Aucun tiret cadratin, nulle part (`npm run check:text`).
- Test d'abord : chaque règle ou correctif commence par un test qui échoue. Un adaptateur se teste sur des données réelles anonymisées (`fixtures/`).
- Les adaptateurs Hermès lisent seulement : bases SQLite ouvertes en `readOnly`, aucune écriture dans `~/.hermes` (règle de lint dédiée).
- Primer : avant d'écrire un composant ou un CSS, interroger le MCP Primer (`.mcp.json` ; lancer Claude Code depuis la racine du dépôt pour qu'il soit chargé). `npm run lint` applique `eslint-plugin-primer-react`, `npm run lint:css` la config stylelint de Primer, la même vérification que l'outil `lint_css` du MCP.
- Mouvement : jetons `--motion-*` de Primer, 500 ms au plus ; toute animation en boucle porte `data-loop` (coupée par le bouton de pause et par `prefers-reduced-motion`) ; jamais d'information portée par le seul mouvement.
- Vocabulaire de l'interface, un concept, un mot : agent (jamais « profil »), carte, issue, station, intervention, lane (le CLI délégué). Vérifié par `npm run check:text`.
- Visualisations : un seul dessin de graphe (`ui/flow`, stations rondes reliées par une voie) et une seule timeline (`Timeline` de Primer, `ui/timeline`), partout ; les agents ont chacun leur avatar (`ui/agents`).
- Graphe : toujours par `FlowView`, qui choisit le graphe en largeur ou la voie verticale (`FlowRail`) selon la place ; une page fournit les deux (nœuds et liaisons, étapes). Rien ne doit capturer le doigt : vérifier au geste tactile (CDP `Input.dispatchTouchEvent`) que la page défile depuis le graphe et que ses lignes se touchent.
- Interface : composants Primer d'abord ; styles en CSS modules avec les jetons Primer (`var(--bgColor-default)`…), jamais de couleur en dur ; aucun flou ni transparence ; tout texte qui peut déborder est tronqué ou coupé (`min-width: 0`) ; survols seulement sous `@media (hover: hover) and (pointer: fine)` ; cibles tactiles d'au moins 44 px.
- Une nouvelle dépendance : version exacte, peerDependencies compatibles (React 19, Vite 8, TypeScript 6.0), maintenue, sans module natif. Le dire dans la PR.

## Interdits

- Affaiblir une assertion, allonger un délai de test, désactiver une règle de lint ou un test pour passer.
- `git push --force`, `git add .` sans relire, commit de secrets (`.env`, jetons, clés).
- Écrire dans `~/.hermes` ou dans les bases d'Hermès depuis ce dépôt.
- Ajouter un service externe (SaaS, CDN à l'exécution) ou un module natif.

## Données de démonstration

`apps/web/src/demo/` rejoue un scénario réaliste de la factory sans serveur. Il sert à la maquette publiée en artifact et aux tests de bout en bout. Le test `DemoSource.test.ts` vérifie qu'il respecte les contrats.
