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
| kanban.db, state.db, logs de cartes,    | lecture   | PWA React + Primer + React Flow      |
| ~/.claude/projects, opencode.db         |---------->|                                      |
+-----------------------------------------+ seule     +--------------------------------------+
tailscale serve https:8446 -> 127.0.0.1:8446          sortant : api.github.com, Web Push,
Windows : http://localhost:8446                       freellmapi par le réseau Docker
iPhone, Mac : https://desktop-gja56n4.tail40220c.ts.net:8446
```

- Aucun composant n'écrit de fichier pour factory-live. Le direct arrive par HTTP (WSL vers conteneur, le sens déjà utilisé par Hermès vers freellmapi) ; l'état durable et le rattrapage après un redémarrage se lisent dans les bases natives d'Hermès, en lecture seule.
- Si factory-live est arrêté, la factory n'est pas gênée : les envois échouent sans bloquer l'agent et factory-live se recale sur les bases au redémarrage.

## Couches

| Couche                        | Rôle                                                                             | Dépend de            |
| ----------------------------- | -------------------------------------------------------------------------------- | -------------------- |
| `packages/domain`             | Règles pures : stations, interventions, modèle effectif, stats                   | rien                 |
| `packages/contracts`          | Schémas zod de l'API, de l'ingestion, du SSE ; OpenAPI 3.1                       | zod                  |
| `apps/server/src/application` | Hub temps réel, projections, cas d'usage, ports (`ports.ts`), sans entrée-sortie | domain, contracts    |
| `apps/server/src/adapters`    | Hermès (SQLite en lecture), webhooks, transcriptions, GitHub, push, stockage     | ports, bibliothèques |
| `apps/server/src/http`        | Hono : REST, SSE, ingestion                                                      | application          |
| `apps/web`                    | PWA                                                                              | contracts            |

Les règles sont vérifiées en CI par dependency-cruiser (`.dependency-cruiser.cjs`) : l'application n'importe ni adaptateur, ni `http`, ni module Node (fichiers, réseau, SQLite) ; tout passe par ses ports. Sabotage vérifié : un import d'adaptateur ou de `node:fs` dans `application/` fait échouer `npm run check:arch`.

## Sources et corrélation

| Besoin                    | Source                                            | Méthode                                                                   |
| ------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------- |
| Action et modèle en cours | webhooks `pre/post_tool_call`, `post_api_request` | carte tirée du `cwd` du worker, session par `session_id`                  |
| Cartes, runs, transitions | `kanban.db`                                       | `PRAGMA data_version` toutes les 300 ms, `task_events` au-delà du curseur |
| Transcription Hermès      | `state.db` du profil                              | à la demande et pour le rattrapage                                        |
| Terminal brut             | `logs/<task_id>.log` du board                     | à la demande, rendu ANSI                                                  |
| Lane Claude Code          | `~/.claude/projects`                              | dossier tiré du workspace de la carte, fenêtre du run, coût `cost-state`  |
| Lane OpenCode             | session Hermès et log de la carte                 | sortie de `opencode run` ; `opencode.db` n'est pas lu (jetons OAuth)      |
| Santé                     | sonde du gateway + signaux passifs                | « sonde muette » après 90 s sans rapport                                  |
| PR, CI, réactions         | API REST GitHub                                   | ETag, API Actions pour la CI                                              |

## Front

- Une seule interface de données (`apps/web/src/data/source.ts`) : la démo (`DemoSource`) et l'API (REST + SSE) la réalisent.
- Primer React pour les composants, jetons Primer pour les styles, React Flow pour le graphe d'une issue, Motion pour le glissement des issues entre stations.
