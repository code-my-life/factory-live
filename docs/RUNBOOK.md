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
| `~/.config/factory-live`          | lecture            | secrets : `hook-secret`, `github-token` (repli facultatif)        |

Jamais monté : `~/.hermes` en entier (son `.env` porte toutes les clés), `opencode.db` (jetons OAuth d'OpenCode). Les dossiers et non les fichiers : Hermès réécrit ses fichiers par renommage, un fichier monté seul resterait figé. Le réglage `kanban.max_in_progress` arrive par la sonde du gateway.

## Secrets

- `~/.config/factory-live/hook-secret` : secret HMAC partagé avec Hermès (`FACTORY_LIVE_HOOK_SECRET` de `~/.hermes/.env`), créé une fois par `install.sh` de la factory (étape 5b), jamais affiché. Absent : l'ingestion répond 503.
- GitHub App `factory-live` (ADR 0003) : ses clés et les jetons de Clément sont dans la base du volume (`factory-live.db`, mode 600). Mise en place, une fois :
  1. ouvrir `http://localhost:8446/api/github/setup` (ou l'adresse tailnet), « Continuer sur GitHub », garder le nom proposé, « Create GitHub App » ;
  2. GitHub enchaîne sur l'installation : choisir « All repositories », « Install » ;
  3. ouvrir `/api/github/login` (Réglages, « Se connecter à GitHub ») et autoriser l'App : le déblocage part alors au nom de cddev.
     État : `curl -s localhost:8446/api/github/status`. Déconnexion : Réglages, ou `POST /api/github/logout`. Révocation complète : supprimer l'App dans les réglages de l'organisation sur GitHub.
- `~/.config/factory-live/github-token` : facultatif, jeton fine-grained de `cddev` servant de repli tant que l'App n'est pas en place (propriétaire `code-my-life` ; Metadata, Issues lecture et écriture, Pull requests, Actions, Contents et Webhooks en lecture), `chmod 600`. Après l'avoir déposé : `docker restart factory-live`.
- Clés VAPID (push) : générées au premier démarrage dans la base du volume.

## Pannes

| Symptôme                                              | Cause probable                                         | Action                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Santé : « Sonde muette »                              | gateway arrêté, ou factory-live injoignable depuis WSL | `hermes gateway status` ; `curl -s localhost:8446/healthz`                   |
| Santé : « Aucun tick reçu »                           | webhooks du profil default absents                     | `hermes config get hooks.outbound` ; relancer `./install.sh` de la factory   |
| Sources : `kanban.db illisible`, schéma inattendu     | mise à jour d'Hermès qui a changé une table            | lire le détail (colonne citée), adapter `apps/server/src/adapters/hermes/`   |
| Workers : « outbound webhook … failed » dans leur log | factory-live arrêté                                    | `docker compose -f docker/compose.yaml up -d` ; la factory n'est pas gênée   |
| Déblocage : 503                                       | ni connexion GitHub ni jeton de repli                  | Réglages, « Se connecter à GitHub » (`/api/github/login`)                    |
| GitHub : « Installation de l'App illisible » ou repli | App créée mais pas installée                           | `/api/github/status` donne `installUrl` : installer sur « All repositories » |
| Connexion GitHub : « Seul le compte cddev … »         | autre compte GitHub ouvert dans ce navigateur          | se déconnecter de GitHub, puis relancer la connexion                         |
| Déblocage : 😕 sur le commentaire                     | plus aucune carte bloquée sur l'issue                  | rien à faire, la carte est déjà repartie                                     |
| Écriture refusée (403) depuis l'iPhone                | login Tailscale différent de `cddev@github`            | `TAILSCALE_LOGINS` dans `docker/.env`, puis `up -d`                          |
