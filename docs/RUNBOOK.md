# RUNBOOK factory-live

## Le service

| Besoin                 | Commande (depuis WSL, à la racine du dépôt)                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Construire et démarrer | `docker compose -f docker/compose.yaml up -d --build`                                                              |
| État                   | `docker ps --filter name=factory-live` (doit dire `healthy`)                                                       |
| Journal                | `docker logs -f factory-live` (JSON pino, tourne à 10 Mo × 5)                                                      |
| Redémarrer             | `docker restart factory-live`                                                                                      |
| Arrêter                | `docker compose -f docker/compose.yaml down` (les données restent dans le volume `factory-live_factory-live-data`) |

Le conteneur tourne en `restart: unless-stopped`, utilisateur 1000:1000, racine en lecture seule, sans capacité. Port lié à `127.0.0.1:8446`.

## Accès

| Appareil             | Adresse                                                              |
| -------------------- | -------------------------------------------------------------------- |
| Ce PC (Windows, WSL) | `http://localhost:8446`                                              |
| iPhone, Mac          | `https://desktop-gja56n4.tail40220c.ts.net:8446` (tailnet seulement) |

Exposition tailnet : `tailscale serve --bg --https=8446 http://127.0.0.1:8446` (depuis WSL). Jamais Funnel. L'adresse tailnet ne répond pas depuis ce PC lui-même : la tester depuis un autre appareil. Ports déjà pris sur le nœud : 443 Funnel vers 8644 (webhook GitHub), 8443 dashboard Hermès, 8444 graphes, 8445 freellmapi, 8446 factory-live.

## Ce que le conteneur voit

| Montage                           | Mode               | Pourquoi                                                          |
| --------------------------------- | ------------------ | ----------------------------------------------------------------- |
| `~/.hermes/kanban/boards/factory` | écriture (dossier) | `kanban.db` lue en `readOnly` ; SQLite y partage le `-shm` du WAL |
| `~/.hermes/profiles`              | écriture (dossier) | `state.db` et `config.yaml` des profils, même raison              |
| `~/perso/hermes-software-factory` | lecture            | `factory.yaml` et configs du dépôt (dérive)                       |
| `~/.claude/projects`              | lecture            | transcriptions des lanes Claude Code                              |
| `~/.config/factory-live`          | lecture            | secrets : `hook-secret`, `github-token`                           |

Jamais monté : `~/.hermes` en entier (son `.env` porte toutes les clés), `opencode.db` (jetons OAuth d'OpenCode). Les dossiers et non les fichiers : Hermès réécrit ses fichiers par renommage, un fichier monté seul resterait figé. Le réglage `kanban.max_in_progress` arrive par la sonde du gateway.

## Secrets

- `~/.config/factory-live/hook-secret` : secret HMAC partagé avec Hermès (`FACTORY_LIVE_HOOK_SECRET` de `~/.hermes/.env`), créé une fois par `install.sh` de la factory (étape 5b), jamais affiché. Absent : l'ingestion répond 503.
- `~/.config/factory-live/github-token` : jeton fine-grained de `cddev` (propriétaire `code-my-life` ; Metadata, Issues lecture et écriture, Pull requests, Actions, Contents et Webhooks en lecture), `chmod 600`. Absent : lecture seule, pas de déblocage depuis l'app. Après l'avoir déposé : `docker restart factory-live`.
- Clés VAPID (push) : générées au premier démarrage dans la base du volume.

## Pannes

| Symptôme                                              | Cause probable                                         | Action                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| Santé : « Sonde muette »                              | gateway arrêté, ou factory-live injoignable depuis WSL | `hermes gateway status` ; `curl -s localhost:8446/healthz`                 |
| Santé : « Aucun tick reçu »                           | webhooks du profil default absents                     | `hermes config get hooks.outbound` ; relancer `./install.sh` de la factory |
| Sources : `kanban.db illisible`, schéma inattendu     | mise à jour d'Hermès qui a changé une table            | lire le détail (colonne citée), adapter `apps/server/src/adapters/hermes/` |
| Workers : « outbound webhook … failed » dans leur log | factory-live arrêté                                    | `docker compose -f docker/compose.yaml up -d` ; la factory n'est pas gênée |
| Déblocage : 503                                       | pas de jeton GitHub                                    | déposer `github-token`, redémarrer                                         |
| Déblocage : 😕 sur le commentaire                     | plus aucune carte bloquée sur l'issue                  | rien à faire, la carte est déjà repartie                                   |
| Écriture refusée (403) depuis l'iPhone                | login Tailscale différent de `cddev@github`            | `TAILSCALE_LOGINS` dans `docker/.env`, puis `up -d`                        |
