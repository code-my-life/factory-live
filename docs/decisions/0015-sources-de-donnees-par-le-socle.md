# ADR 0015 : les données viennent du socle et de GitHub

Date : 2026-11-12. Statut : accepté. Remplace l'ADR 0002. Fondée sur les ADR 0011 et 0014 de workflow-core
([0011](https://github.com/code-my-life/workflow-core/blob/main/docs/decisions/0011-factory-live-lit-par-une-seule-porte-le.md),
[0014](https://github.com/code-my-life/workflow-core/blob/main/docs/decisions/0014-la-migration-remplace-l-existant-pas-a-pas.md)). Epic code-my-life/factory-live#55, issue #56.

## Contexte

L'ADR 0002 faisait lire à factory-live Hermès lui-même : le direct par ses webhooks signés, l'état par ses bases
(`kanban.db`, `state.db`) ouvertes en lecture seule, la santé par une sonde du gateway. Chaque format d'Hermès se
retrouvait ainsi dans ce dépôt, et un écran pouvait rester faux sans le savoir quand Hermès changeait.

Le **socle** (`code-my-life/workflow-core`) est le service commun des workflows, sur la même machine : il lit les
boards d'Hermès en lecture seule et sert une API HTTP et un flux SSE des changements, derrière un secret partagé. Chaque
événement du flux porte l'état complet de l'élément et un curseur `<époque>:<n>` ; un événement `reset` ouvre une
nouvelle époque et oblige le client à relire l'état complet.

## Décision

- factory-live lit le socle (son API et son flux SSE, avec le secret partagé) et GitHub, rien d'autre.
- Pendant la migration, une variable d'environnement, l'**interrupteur** `LIVE_SOURCE=hermes|workflow-core`,
  choisit la source : Hermès comme avant, ou le socle. Le retour arrière d'une bascule est de rebasculer
  l'interrupteur.
- Côté socle, un `reset` vide l'état gardé et le relit en entier ; sans réponse du socle, l'écran garde le dernier
  état reçu et dit que le socle est injoignable.
- Les webhooks d'Hermès, la sonde de santé et la lecture des bases d'Hermès restent tant que l'interrupteur peut
  revenir sur Hermès. Ils partent une fois la bascule faite en production et son retour arrière essayé, dans l'epic
  suivant (« L'ancienne lecture d'Hermès quitte factory-live »).

## Écartés

- Garder les deux lectures sans interrupteur, chacune pour une partie de l'écran : deux sources pour la même carte,
  et aucun retour arrière simple.
- Basculer d'un coup, sans interrupteur : l'ADR 0014 de workflow-core exige qu'une étape se défasse.

## Conséquences

- Les formats d'Hermès ne sont plus lus ici une fois la bascule faite : seul l'adaptateur Hermès du socle les connaît
  (ADR 0001 de workflow-core).
- Le secret du socle et son adresse rejoignent l'environnement du conteneur ; aucun secret dans le dépôt.
- Ce que 0002 dit des webhooks et des bases reste vrai côté Hermès de l'interrupteur, jusqu'à leur retrait.
