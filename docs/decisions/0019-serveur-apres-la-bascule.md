# ADR 0019 : le serveur après la bascule sur le socle

Date : 2026-11-12. Statut : accepté. Amende l'ADR 0007. Fondée sur l'ADR 0011 de workflow-core
([0011](https://github.com/code-my-life/workflow-core/blob/main/docs/decisions/0011-factory-live-lit-par-une-seule-porte-le.md)). Epic code-my-life/factory-live#55, issue #56.

## Contexte

L'ADR 0007 décrit le serveur : il reçoit les webhooks d'Hermès et la sonde, lit le kanban et les sessions, et garde
un **miroir du kanban** dans sa base, parce que le ménage d'Hermès purge les cartes après 30 jours. Avec la lecture par
le socle (ADR 0015), la réception et le miroir n'ont plus de raison d'être une fois la bascule faite.

## Décision

- La réception des webhooks d'Hermès (`/api/ingest/hermes`, `/api/ingest/health`) et le miroir du kanban partent
  après la bascule et l'essai de son retour arrière.
- factory-live garde son propre historique au-delà de la purge d'Hermès, tiré de ce que le socle lui sert.
- Ne changent pas : les couches et leur règle dependency-cruiser, la garde des écritures (requête locale ou login
  Tailscale autorisé, origine contrôlée, en-tête `x-factory-live: 1`, 30 écritures par minute), le Web Push et ses
  clés VAPID, et le reste de l'ADR 0007.

## Écartés

- Retirer la réception dès l'arrivée de l'interrupteur : le retour arrière sur Hermès ne serait plus possible.

## Conséquences

- Tant que l'interrupteur peut revenir sur Hermès, les deux chemins vivent dans le serveur ; l'epic suivant retire
  l'ancien.
