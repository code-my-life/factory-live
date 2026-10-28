# ADR 0003 : débloquer par un commentaire /factory unblock

Date : 2026-10-28, révisée le même jour pour la GitHub App. Statut : accepté.

## Décision

- `POST /api/interventions/:id/unblock` poste `/factory unblock <réponse>` sur l'issue, au nom de cddev.
- Accès à GitHub par une GitHub App dédiée, choix de Clément du 2026-10-28 :
  - créée en un clic depuis factory-live (`/api/github/setup`, manifeste GitHub), privée, sans webhook, installée sur tous les dépôts de `code-my-life` ;
  - lectures (issues, PR, CI, livraisons de webhooks) avec le jeton d'installation de l'App : 1 h, renouvelé seul, demandé par un JWT RS256 signé de la clé privée de l'App ; quota propre à l'App, API Checks ouverte ;
  - écriture du commentaire avec le jeton utilisateur de Clément, obtenu par la connexion GitHub de l'App (OAuth web, PKCE S256, état à usage unique de 10 min), depuis ce PC comme depuis l'iPhone ; jeton de 8 h rafraîchi seul pendant 6 mois ;
  - permissions : Metadata, Issues en écriture ; Pull requests, Actions, Checks, Statuses, Contents et Webhooks des dépôts en lecture.
- Le jeton fine-grained de `~/.config/factory-live/github-token` reste un repli, utilisé tant que l'App n'existe pas, n'est pas installée ou que Clément n'est pas connecté.
- Le suivi se lit sur la réaction du bot au commentaire (+1 accepté, confused rien à débloquer) puis sur l'événement `unblocked` du kanban.
- Une carte sans issue, un triage ou une carte retenue par `active_pr` ne passent pas par là : l'app affiche les commandes exactes à copier.
- Le merge reste une approbation de la PR sur GitHub.

## Pourquoi

C'est le chemin existant de la factory, relais `active_pr` compris (`scripts/github-issue-commands.py`), et la décision reste tracée sur l'issue. Le bot ne lit que les commentaires dont l'auteur est un decider (`cddev`, OWNER ou MEMBER) : un commentaire posté avec le jeton utilisateur de l'App a cddev pour auteur (l'App n'apparaît que dans `performed_via_github_app`, que le bot ne regarde pas), alors qu'un jeton d'installation le signerait `factory-live[bot]`. L'App évite un jeton personnel à recréer à la main et ouvre l'API Checks.

## Sécurité

- Clé privée et secret client de l'App, jetons de Clément : dans la base de factory-live (volume Docker, fichier en mode 600), jamais dans le dépôt, les journaux ou l'API.
- Pages de création et de connexion réservées à ce PC et au login Tailscale autorisé ; seul le compte `cddev` est accepté, par son login et son identifiant stable.
- L'installation se retrouve par l'organisation (`GET /orgs/code-my-life/installation`), jamais par un identifiant reçu dans une URL.

## Ce que cela ne couvre pas

La commande débloque toutes les cartes bloquées de l'issue. À confirmer à la recette : le bot réagit au commentaire posté par l'App au nom de cddev (vérifié dans son code) ; GitHub ramène bien la connexion vers l'adresse tailnet.
