# ADR 0003 : débloquer par un commentaire /factory unblock

Date : 2026-10-28. Statut : accepté.

## Décision

- `POST /api/interventions/:id/unblock` poste `/factory unblock <réponse>` sur l'issue, au nom de cddev, avec un jeton fine-grained dédié (Metadata, Issues en écriture, Pull requests, Actions, Contents et Webhooks en lecture).
- Le suivi se lit sur la réaction du bot au commentaire (+1 accepté, confused rien à débloquer) puis sur l'événement `unblocked` du kanban.
- Une carte sans issue, un triage ou une carte retenue par `active_pr` ne passent pas par là : l'app affiche les commandes exactes à copier.
- Le merge reste une approbation de la PR sur GitHub.

## Pourquoi

C'est le chemin existant de la factory, relais `active_pr` compris (`scripts/github-issue-commands.py`), et la décision reste tracée sur l'issue.

## Ce que cela ne couvre pas

La commande débloque toutes les cartes bloquées de l'issue. Un jeton fine-grained ne lit pas l'API Checks : la CI se lit par l'API Actions.
