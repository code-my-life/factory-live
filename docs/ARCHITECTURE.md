# Architecture

## Vue d'ensemble

```
WSL (hôte)                                            Conteneur factory-live (Docker Desktop)
+-----------------------------------------+           +--------------------------------------+
| workers Hermès (un process par carte)   | POST HTTP | ingestion signée (HMAC, anti-rejeu)  |
|   hooks.outbound natifs                 |---------->|                                      |
| gateway + dispatcher                    | signé     | domaine : stations, interventions,   |
|   hooks.outbound natifs                 |---------->|   modèle effectif, stats             |
|   factory-live-probe (santé, 30 s)      |---------->| serveur Hono : REST + SSE, push,     |
+-----------------------------------------+           |   historique (SQLite), client GitHub |
| kanban.db, state.db, logs de cartes,    | lecture   | PWA React + Primer + Motion          |
| ~/.claude/projects, opencode.db         |---------->|                                      |
+-----------------------------------------+ seule     +--------------------------------------+
tailscale serve https:8446 -> 127.0.0.1:8446          sortant : api.github.com, Web Push,
Windows : http://localhost:8446                       freellmapi par le réseau Docker
iPhone, Mac : https://<machine>.<tailnet>.ts.net:8446
```

- Aucun composant n'écrit de fichier pour factory-live. Le direct arrive par HTTP (WSL vers conteneur, le sens déjà utilisé par Hermès vers freellmapi) ; l'état durable et le rattrapage après un redémarrage se lisent dans les bases natives d'Hermès, en lecture seule.
- Si factory-live est arrêté, la factory n'est pas gênée : les envois échouent sans bloquer l'agent et factory-live se recale sur les bases au redémarrage.

## Couches

| Couche                        | Rôle                                                                             | Dépend de            |
| ----------------------------- | -------------------------------------------------------------------------------- | -------------------- |
| `packages/domain`             | Règles pures : stations, interventions, modèle effectif, stats, diagnostic       | rien                 |
| `packages/contracts`          | Schémas zod de l'API, de l'ingestion, du SSE ; OpenAPI 3.1                       | zod                  |
| `apps/server/src/application` | Hub temps réel, projections, cas d'usage, ports (`ports.ts`), sans entrée-sortie | domain, contracts    |
| `apps/server/src/adapters`    | Hermès (SQLite en lecture), webhooks, transcriptions, GitHub, push, stockage     | ports, bibliothèques |
| `apps/server/src/http`        | Hono : REST, SSE, ingestion                                                      | application          |
| `apps/web`                    | PWA                                                                              | contracts            |

Les règles sont vérifiées en CI par dependency-cruiser (`.dependency-cruiser.cjs`) : l'application n'importe ni adaptateur, ni `http`, ni module Node (fichiers, réseau, SQLite) ; tout passe par ses ports. Sabotage vérifié : un import d'adaptateur ou de `node:fs` dans `application/` fait échouer `npm run check:arch`.

## Sources et corrélation

| Besoin                    | Source                                            | Méthode                                                                       |
| ------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| Action et modèle en cours | webhooks `pre/post_tool_call`, `post_api_request` | carte tirée du `cwd` du worker, session par `session_id`                      |
| Cartes, runs, transitions | `kanban.db`                                       | `PRAGMA data_version` toutes les 300 ms, `task_events` au-delà du curseur     |
| Transcription Hermès      | `state.db` du profil                              | à la demande et pour le rattrapage                                            |
| Terminal brut             | `logs/<task_id>.log` du board                     | à la demande, rendu ANSI                                                      |
| Lane Claude Code          | `~/.claude/projects`                              | dossier tiré du workspace de la carte, fenêtre du run, coût `cost-state`      |
| Lane OpenCode             | session Hermès et log de la carte                 | sortie de `opencode run` ; `opencode.db` n'est pas lu (jetons OAuth)          |
| Santé                     | sonde du gateway + signaux passifs                | « sonde muette » après 90 s sans rapport                                      |
| PR, CI, réactions         | API REST GitHub                                   | ETag, API Actions pour la CI                                                  |
| Diagnostic d'un blocage   | `state.db`, `logs/agent.log`, configs, plugins    | liste blanche (`adapters/hermes/paths.ts`), recalcul sur empreinte (ADR 0009) |

## Front

- Une seule interface de données (`apps/web/src/data/source.ts`) : la démo (`DemoSource`) et l'API (REST + SSE) la réalisent.
- Primer React pour les composants, jetons Primer pour les styles, une voie en CSS (`FlowLine`) pour la ligne d'usine comme pour le graphe d'une issue, Motion pour le glissement des issues entre stations.
- Langues (ADR 0008) : français et anglais, dictionnaires typés (`apps/web/src/i18n`) et API Intl. Le serveur n'écrit pas de phrases pour la PWA : ce qu'il fabrique circule en codes et paramètres (`Message`, `Text` dans les contrats), écrits par la PWA et par le service worker dans la langue choisie sur l'appareil.

## Diagnostic des blocages (ADR 0009)

Chaque intervention qui s'explique porte un diagnostic : la cause, qui agit, si « Débloquer » suffit, les étapes et leurs commandes, les preuves, le verdict de chaque run. Des règles pures (`packages/domain/src/diagnosis`) l'établissent sur des faits ; aucun modèle n'écrit ni ne réécrit rien, chaque phrase est un gabarit du catalogue et chaque citation un texte d'Hermès tel quel.

| Fait                                  | Source                                                  | Lecture                                                           |
| ------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| Appels et résultats d'outils d'un run | `state.db` de l'agent                                   | session du run jamais devinée, début et fin des contenus          |
| Hook coupé, relances, échecs d'API    | `logs/agent.log` (puis `.1`) de l'agent                 | par morceaux, reprise à l'octet, heure locale datée (`HERMES_TZ`) |
| Délais en service et valeur du dépôt  | `config.yaml` de l'agent et du dépôt de la factory      | à chaque changement de date du fichier                            |
| Hooks des plugins actifs              | `plugins/<plugin>/__init__.py` (agent, sinon dépôt)     | `register_hook("<hook>", <fonction>)`                             |
| Preuves de la carte                   | `workspaces/<carte>/evidence`, sinon `evidence/<carte>` | 50 fichiers au plus, sans fichier caché ni lien                   |

`DiagnosisService` (`apps/server/src/application/diagnosis.ts`) calcule après chaque lecture du kanban, au tick et toutes les 2 s sur les seules empreintes des fichiers ; la projection du tableau ne lit que son cache. Le chemin du diagnostic n'importe aucun module réseau (`diagnosis-is-offline`, dependency-cruiser).
