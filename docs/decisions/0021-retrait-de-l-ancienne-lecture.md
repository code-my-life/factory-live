# ADR 0021 : l'ancienne lecture d'Hermès est retirée

Date : 2026-11-15. Statut : accepté. Amende les ADR 0010, 0014, 0015 et 0019. Fondée sur les ADR 0001 et 0006 de
workflow-core. Epic code-my-life/factory-live#71, issue #72.

## Contexte

Depuis la bascule (ADR 0015, tâche #69), factory-live lit la factory par le socle (`code-my-life/workflow-core`). Les
ADR 0015 et 0019 gardaient l'ancienne lecture derrière l'**interrupteur** `LIVE_SOURCE=hermes`, pour le retour arrière :
lecteurs des bases d'Hermès et du dépôt de la factory, miroir du kanban, réception des webhooks et de la sonde
(`/api/ingest/hermes`, `/api/ingest/health`), diagnostic par règles, montages du conteneur. L'ADR 0014 faisait lire la
fiche de la ligne du code dans le dépôt de la factory, avec une **copie embarquée** dans l'app en repli, et la fiche du
studio dans l'API de video-factory. L'architecture veut que seul l'adaptateur du socle connaisse Hermès (ADR 0001 de
workflow-core) et qu'aucune fiche ni règle de fiche ne soit embarquée dans un client (ADR 0006 de workflow-core).

## Décision

- **Plus d'interrupteur.** factory-live lit la factory par le socle seulement ; il exige `WORKFLOW_CORE_URL` et le
  secret `workflow-core-secret`. Une variable `LIVE_SOURCE` encore posée est ignorée.
- **L'ancienne lecture part** : les lecteurs d'Hermès et du dépôt de la factory, le miroir du kanban (le code ne lit
  ni n'écrit plus ses tables, qui restent dans une base existante, sans `DROP`), sa surveillance, la réception des
  webhooks et de la sonde (404), le secret `hook-secret`, le diagnostic par règles et son service, les montages du
  conteneur et les variables `HERMES_HOME`, `HERMES_BOARD`, `FACTORY_REPO`, `CLAUDE_PROJECTS`, `HERMES_TZ`.
- **Les fiches viennent du socle, qui les juge.** La ligne du code se dessine depuis la fiche que sert le socle, la
  dernière reçue tant qu'il ne répond pas ; avant la première, la ligne dit qu'elle l'attend. La vue du studio prend sa
  fiche au socle (`/api/workflows/studio/sheet`) et garde son adaptateur pour ses éléments, ses médias et son geste.
  Aucune fiche n'est embarquée dans l'app ; la démo garde les siennes comme données (`apps/web/src/demo/sheets/`).
  `packages/contracts/src/workflow.ts` ne décrit plus que la forme d'une fiche : la règle de fiche
  (`parseWorkflowSheet`) part.
- **Une règle de CI** (`apps/server/src/runtimeName.test.ts`, dans `npm run verify:fast`) refuse toute mention
  d'Hermès dans les fichiers suivis de `apps/`, `packages/`, `docker/`, `e2e/` et `scripts/`, hors de la vue du studio
  (jusqu'à l'epic du studio sur le socle), des dictionnaires, de la démo et d'une liste déclarée dans le test. La valeur `hermes`
  que factory-live écrit lui-même (groupe de tuiles de sa page Santé, source de la session d'un agent, valeurs du
  contrat entre son serveur et son app web) s'écrit dans `packages/contracts/src/runtime.ts` seul, exemption
  provisoire que la story 4 de l'epic retire en renommant ces valeurs. Le socle, lui, n'envoie que le groupe de santé
  de ses contrôles, qui passe à `runtime` à la story 3. Le nom du dépôt `hermes-software-factory` est permis partout.

## Écartés

- Garder l'interrupteur plus longtemps : le retour arrière se fait désormais par le code d'avant ce retrait, essayé en
  production (R4 de l'epic).
- Supprimer les tables du miroir : une base relancée par l'ancien code retrouve son miroir (décision du propriétaire).

## Conséquences

- Les tuiles Santé que seuls les webhooks alimentaient (dispatcher, fournisseurs, Claude Code) restent comme elles
  étaient côté socle : inconnues, sans fournisseur.
- Un retour arrière relance l'image d'avant ce retrait, avec ses montages et ses variables.
