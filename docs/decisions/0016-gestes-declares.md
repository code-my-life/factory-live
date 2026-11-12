# ADR 0016 : les gestes déclarés par un workflow

Date : 2026-11-12. Statut : accepté. Remplace l'ADR 0003. Fondée sur l'ADR 0010 de workflow-core
([0010](https://github.com/code-my-life/workflow-core/blob/main/docs/decisions/0010-une-reponse-du-proprietaire-s-applique-une-fois.md)). Epic code-my-life/factory-live#55, issue #56.

## Contexte

L'ADR 0003 codait en dur le seul geste de factory-live : `POST /api/interventions/:id/unblock` postait
`/factory unblock <réponse>` sur l'issue. Un autre workflow, ou un autre geste, demandait du code ici. L'ADR 0010 de
workflow-core fait du socle le seul récepteur des réponses du propriétaire, appliquées une fois à l'attente qu'elles
nomment.

## Décision

- Un **geste** est un commentaire `/<clé du workflow> <geste>` posté sur l'issue d'un élément. factory-live poste un
  geste, ou ouvre une issue, pour les seuls gestes que le socle publie comme déclarés par le workflow (leur liste vient
  de l'entrée du workflow dans `config/workflows.toml` du socle, en attendant les manifestes). Aucun geste n'est codé
  en dur. Dans l'epic code-my-life/factory-live#55, seul `/factory unblock` est déclaré.
- Le commentaire et l'issue sont écrits au nom du compte du propriétaire (`cddev`), avec le jeton utilisateur de la
  GitHub App, le seul compte que la factory écoute.
- Ce que l'ADR 0003 dit de la GitHub App reste vrai et est repris tel quel :
  - création en un clic depuis factory-live (`/api/github/setup`, manifeste GitHub), App privée, sans webhook,
    installée sur tous les dépôts de `code-my-life` ;
  - lectures avec le jeton d'installation (1 h, renouvelé seul, demandé par un JWT RS256) ; écriture avec le jeton
    utilisateur obtenu par la connexion GitHub de l'App (OAuth web, PKCE S256, état à usage unique de 10 min), de 8 h,
    rafraîchi seul pendant 6 mois ;
  - permissions : Metadata, Issues en écriture ; Pull requests, Actions, Checks, Statuses, Contents et Webhooks des
    dépôts en lecture ; le jeton fine-grained de `~/.config/factory-live/github-token` reste un repli ;
  - sécurité : clé privée, secret client et jetons dans la base de factory-live (fichier en mode 600), jamais dans le
    dépôt, les journaux ou l'API ; pages de création et de connexion réservées à ce PC et au login Tailscale
    autorisé ; seul `cddev` est accepté, par son login et son identifiant stable ; l'installation se retrouve par
    l'organisation ;
  - suivi par la réaction du bot (`FACTORY_BOT_LOGIN`) au commentaire : +1 accepté, confused rien à débloquer ; seule
    la réaction du bot compte.
- Le merge reste une approbation de la PR sur GitHub.

## Écartés

- Garder un geste par route codée en dur : chaque workflow ajouterait du code ici.
- Faire poster le geste par le socle : l'ADR 0011 de workflow-core ne lui donne aucune route de geste, et le jeton
  utilisateur reste dans la base de factory-live.

## Conséquences

- Un geste nouveau se déclare côté socle ; factory-live n'a rien à changer.
- La garde des écritures de l'ADR 0007 (ce PC ou un login Tailscale autorisé, en-tête, cadence) s'applique à chaque
  geste.
