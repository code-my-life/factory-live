# ADR 0007 : serveur, réception des webhooks et données lues

Date : 2026-10-28. Statut : accepté.

## Contexte

Phase 4 du plan : le serveur reçoit les webhooks natifs d'Hermès et la sonde, lit le kanban et les sessions en lecture seule, et sert l'API, le flux SSE et la PWA. Chaque format a été vérifié dans le code d'Hermès v0.22.2 et sur les vraies bases, en lecture seule.

## Faits vérifiés

- Corps des webhooks : `agent/shell_hooks.py:_payload_fields`. `cwd` est le dossier courant du process ; un worker kanban est lancé dans le workspace de sa carte (`hermes_cli/kanban_db_dispatch.py`, `Popen(cwd=workspace)`), d'où l'id de carte. Dans les hooks d'outil et d'API, `extra.task_id` est l'id du tour de l'agent, pas la carte ; dans les hooks kanban c'est la carte.
- Hermès plafonne requêtes et réponses des hooks d'API à 50 000 caractères (`HERMES_PLUGIN_PAYLOAD_MAX_CHARS`) : `api_request_error` (qui porte la requête) reste donc borné et n'arrive qu'en cas d'erreur ; il est gardé pour voir les 429.
- `post_tool_call` porte le résultat complet de l'outil : la réception ne garde qu'une liste blanche de champs (statut, erreur, durée, modèle, usage, carte, etc.) et, des entrées d'outil, la commande, le chemin ou le nom. Chaînes bornées à 2 000 caractères, secrets masqués.
- `on_session_end` est émis à la fin de chaque `run_conversation()`, soit la fin du worker pour une carte.
- `session_model_usage` note le modèle tel qu'Hermès le voit : `auto` pour freellmapi. Le modèle réellement servi n'est connu que par `post_api_request.response_model` ; avant les webhooks, l'interface affiche donc `auto`.
- Un run se rattache à sa session par `metadata.worker_session_id`, sinon par la session `kanban` du même profil lancée avec le run (le titre de la session est celui de la carte).
- `kanban.max_in_progress: 2` et `max_in_progress_per_profile: 1` (config du profil default) : un profil tient une carte à la fois ; l'état en direct est pourtant tenu par profil et par carte, au cas où ce réglage change.
- Le bot de la factory (`scripts/github-issue-commands.py`) ne lit `/factory unblock` que de `cddev` (OWNER ou MEMBER) et répond par une réaction : 👍 accepté, 😕 rien à débloquer.
- `opencode.db` contient les jetons OAuth d'OpenCode (tables `account`, `credential`) : il n'est ni monté ni lu. La lane OpenCode se lit dans la session Hermès (sortie de `opencode run`) et dans le log de la carte.

## Décisions

- Couches : `application/` (hub, projections, cas d'usage) ne connaît que ses ports ; les adaptateurs les implémentent ; règle dependency-cruiser sans exception.
- Miroir du kanban dans la base de factory-live (le `gc` d'Hermès purge après 30 jours), activité reçue gardée 30 jours, agrégats d'usage sans limite.
- Écritures : requête locale (hôte `localhost` sans en-tête `X-Forwarded-*`) ou login Tailscale autorisé (`TAILSCALE_LOGINS`), origine contrôlée, en-tête `x-factory-live: 1` obligatoire, 30 écritures par minute. À vérifier en phase 7 : `tailscale serve` ajoute bien `X-Forwarded-For` aux requêtes du tailnet.
- Déblocage : le même chemin qu'une réponse humaine (`/factory unblock <réponse>` sur l'issue, relais `active_pr` compris), idempotent (une seule publication par intervention), suivi par la réaction du bot puis l'événement `unblocked` du kanban.
- Web Push : contact VAPID = URL du dépôt, aucune adresse e-mail envoyée aux services de push d'Apple et de Google ; clés générées au premier démarrage dans la base de factory-live.

## Vérifié le 2026-10-28

- Serveur lancé sur les vraies données (lecture seule, base temporaire) : instantané conforme au contrat, historique (10 issues livrées sur 30 jours, délai médian 159 min, taux de passage en gate par harnais), détail de `claude-cockpit#42` (7 cartes, runs, modèles), transcription du run 165 (146 entrées, log brut), configs et dérive des profils.
- 183 tests ; ingestion signée, anti-rejeu, garde des écritures, déblocage unique, reprise SSE couverts par des tests d'intégration.
