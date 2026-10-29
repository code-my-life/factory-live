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

| Appareil             | Adresse                                                                          |
| -------------------- | -------------------------------------------------------------------------------- |
| Ce PC (Windows, WSL) | `http://localhost:8446`                                                          |
| iPhone, Mac          | l'adresse tailnet, `https://<machine>.<tailnet>.ts.net:8446` (tailnet seulement) |

Exposition tailnet : `tailscale serve --bg --https=8446 http://127.0.0.1:8446` (depuis WSL). Jamais Funnel. L'adresse tailnet ne répond pas depuis ce PC lui-même : la tester depuis un autre appareil. Le nom tailnet réel de ce PC est dans `docker/.env` (section suivante).

## Valeurs propres à ce PC (`docker/.env`)

Le nom tailnet de ce PC, le login Tailscale autorisé à écrire et l'adresse du dashboard d'Hermès n'entrent jamais dans le dépôt, qui est public : leurs vraies valeurs sont dans `docker/.env`, ignoré par git, que compose lit à chaque `up`. Modèle commenté : `docker/.env.example`. Sans `docker/.env`, factory-live ne répond qu'à ce PC (`http://localhost:8446`) et n'accepte d'écriture que de lui.

| Variable           | Rôle                                                                                                               | Forme                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `PUBLIC_ORIGINS`   | adresses de la PWA : ce PC, puis l'adresse tailnet (Réglages, « Installer l'app », retours de GitHub, hôtes admis) | `http://localhost:8446,https://<machine>.<tailnet>.ts.net:8446` |
| `TAILSCALE_LOGINS` | logins Tailscale autorisés à écrire depuis les autres appareils                                                    | `<login>@github`                                                |
| `DASHBOARD_URL`    | dashboard d'Hermès, lien des interventions ; vide : pas de lien                                                    | `https://<machine>.<tailnet>.ts.net:<port>`                     |
| `ALLOWED_HOSTS`    | hôtes acceptés en plus (`nom:port`), par exemple si le port publié change                                          | vide                                                            |
| `HERMES_TZ`        | fuseau de ce PC (IANA) : le journal d'Hermès note l'heure locale sans fuseau, le conteneur est en UTC              | `Europe/Paris` (défaut)                                         |

Après un changement : `docker compose -f docker/compose.yaml up -d`. Le fichier ne s'affiche pas en entier (`grep -c` ou `cut -d= -f1` pour vérifier ses clés). `npm run check:text` refuse tout nom tailnet ou login Tailscale réel dans le dépôt : doc, tests et démo n'emploient que le gabarit ci-dessus, l'exemple fictif `machine.tailnet.ts.net` et `alice@github`.

## Installer l'app et activer les notifications

| Appareil     | Installer                                                                                                            | Notifications                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| iPhone, iPad | Safari sur l'adresse tailnet, Partager, « Sur l'écran d'accueil », puis ouvrir factory-live depuis l'écran d'accueil | Réglages de l'app, « Activer les notifications », accepter ; « Envoyer un test » |
| Ce PC        | `http://localhost:8446` dans Edge ou Chrome, icône d'installation dans la barre d'adresse                            | idem ; Windows doit autoriser les notifications d'Edge ou de Chrome              |
| Mac          | adresse tailnet dans Safari (Fichier, « Ajouter au Dock ») ou Chrome                                                 | idem                                                                             |

L'en-tête dit l'état du lien : « En direct », « Connexion… », « Hors ligne · dernier état il y a … » (l'app montre le dernier état reçu), « En pause » (factory en pause), « Factory muette » (factory-live ne reçoit plus rien de la factory : voir Pannes).

## Tests de bout en bout

`npm run e2e` lance Playwright sous Chromium : la démo (bureau et iPhone), et l'app « live » branchée sur un faux serveur d'API (`e2e/fake-api.mjs`) que les tests coupent et rétablissent. WebKit (Safari, iPhone) et les captures de référence tournent dans l'image officielle de Playwright, comme en CI (il manque à WSL des bibliothèques pour WebKit) :

```sh
docker run --rm --ipc=host --user "$(id -u):$(id -g)" -e HOME=/tmp -e E2E_WEBKIT=1 \
  -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v1.64.1-noble npx playwright test
```

Une capture qui change exprès : la même commande avec `npm run e2e:captures -- --update-snapshots` à la place de `npx playwright test`, puis relire les images de `e2e/captures.spec.ts-snapshots/` avant de les commiter. Sous WSL, `npm run e2e` compare aussi ces captures, avec d'autres polices de secours : un écart de quelques pixels y est attendu, seule l'image de Playwright fait foi.

## Le site public

`site/` construit la page d'accueil (anglais, `fr/`) et la démo de l'app dans `site/dist`, servi sous `/factory-live/` comme sur GitHub Pages :

| Besoin               | Commande                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| Construire           | `npm run site:build`                                                                                 |
| Prévisualiser        | `npm run site:preview`, puis http://127.0.0.1:4195/factory-live/                                     |
| Tester               | `npm run site:test` (WebKit : la commande des e2e ci-dessus, `-c site/playwright.config.ts`)         |
| Refaire les captures | la commande ci-dessous, puis relire `site/src/img/en`, `site/src/img/fr` et `docs/factory-live*.png` |

```sh
docker run --rm --ipc=host --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v1.64.1-noble node site/capture.mjs
```

Publication : le workflow Site (`.github/workflows/pages.yml`) publie depuis main dès que le dépôt est public. À faire une fois, dans les réglages du dépôt : Pages, Source « GitHub Actions ».

## Ce que le conteneur voit

| Montage                           | Mode               | Pourquoi                                                                                           |
| --------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| `~/.hermes/kanban/boards/factory` | écriture (dossier) | `kanban.db` lue en `readOnly` ; SQLite y partage le `-shm` du WAL ; preuves des cartes             |
| `~/.hermes/profiles`              | écriture (dossier) | `state.db` et `config.yaml` des agents, même raison ; journal et plugins actifs pour le diagnostic |
| `~/perso/hermes-software-factory` | lecture            | `factory.yaml` et configs du dépôt (dérive)                                                        |
| `~/.claude/projects`              | lecture            | transcriptions des lanes Claude Code                                                               |
| `~/.config/factory-live`          | lecture            | secrets : `hook-secret`, `github-token` (repli facultatif)                                         |

Le diagnostic ne lit d'un agent que sa config, son journal (`logs/agent.log`, `agent.log.1`), le code de ses plugins actifs et les preuves de ses cartes, par une liste blanche (`apps/server/src/adapters/hermes/paths.ts`) : ni lien symbolique, ni sortie de dossier, ni `.env`, ni `auth.json`. Jamais monté : `~/.hermes` en entier (son `.env` porte toutes les clés), `opencode.db` (jetons OAuth d'OpenCode). Les dossiers et non les fichiers : Hermès réécrit ses fichiers par renommage, un fichier monté seul resterait figé. Le réglage `kanban.max_in_progress` arrive par la sonde du gateway.

## Diagnostic des blocages

Chaque intervention dit sa cause, qui agit, si « Débloquer » suffit et quoi faire (ADR 0009). Des règles du domaine l'établissent sur les faits d'Hermès, sans modèle ; tant que la cause est présente côté factory, le serveur refuse le déblocage (`cause_present`), sauf « Débloquer quand même ».

| Besoin                        | Commande ou fichier                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Lire le diagnostic en cours   | `curl -s localhost:8446/api/snapshot \| jq '.interventions[] \| {id, cause: .diagnosis.primary.code, when: .diagnosis.unblock.when}'` |
| Verdicts des runs d'une issue | `curl -s localhost:8446/api/issues/<dépôt>/<numéro> \| jq '.cards[].runs[] \| {id, outcome, verdict: .verdict.finding}'`              |
| Formats d'Hermès reconnus     | `packages/domain/src/diagnosis/hermesText.ts` (résultats d'outils, erreurs des runs, lignes du journal)                               |
| Règles                        | `packages/domain/src/diagnosis/rules.ts`, choix de la cause et conseil dans `diagnose.ts`                                             |

**Capturer un incident réel**, pour en faire un cas de test : `npm run capture:incident -- <carte> --name <cas> [--anchor <événement>]`. Le script lit en lecture seule le kanban, les sessions et le journal (`HERMES_HOME`, `HERMES_TZ`) et écrit l'entrée sur la sortie standard, anonymisée (dossier personnel, utilisateur, machine, jetons). Ajouter le nom à `IncidentName` et l'entrée à `INCIDENTS` (`incidents.test-helpers.ts`), relire, puis `npm run check:text`. Sans `--anchor`, l'événement raconté est le dernier échec de la carte ; relire `status`, `blockKind` et `blockRecurrences`, qui doivent être ceux du moment de l'incident.

**Ajouter une règle** quand un blocage sort « inexpliqué » :

1. capturer l'incident (ci-dessus) et écrire le test qui échoue dans `diagnose.test.ts` (cas réel) ou `rules.test.ts` (format exact d'Hermès) ;
2. si le texte d'Hermès est nouveau, l'ajouter à `hermesText.ts`, tel qu'Hermès l'écrit, avec un test, jamais une lecture du texte de l'agent ;
3. écrire la règle dans `rules.ts` (cause, qui agit, état de la cause, preuves, étapes) et l'ajouter à `RULES` ; le code à `FindingCode` (domaine et contrats), son rang à `TIER`, ce qu'elle explique à `EXPLAINS` ;
4. ses phrases : codes `diagnosis.*` au catalogue (`packages/contracts/src/messages.ts`), puis dans `fr.ts` et `en.ts` ;
5. `npm run verify:fast`.

Le fuseau du journal suit `HERMES_TZ` (`docker/.env`) : après un changement d'heure ou de fuseau de ce PC, le diagnostic date le journal d'après lui ; une heure qui existe deux fois en octobre suit l'ordre du journal.

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

| Symptôme                                              | Cause probable                                                                        | Action                                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Santé : « Sonde muette »                              | gateway arrêté, ou factory-live injoignable depuis WSL                                | `hermes gateway status` ; `curl -s localhost:8446/healthz`                                              |
| Santé : « Aucun tick reçu »                           | webhooks du profil default absents                                                    | `hermes config get hooks.outbound` ; relancer `./install.sh` de la factory                              |
| Sources : `kanban.db illisible`, schéma inattendu     | mise à jour d'Hermès qui a changé une table                                           | lire le détail (colonne citée), adapter `apps/server/src/adapters/hermes/`                              |
| Workers : « outbound webhook … failed » dans leur log | factory-live arrêté                                                                   | `docker compose -f docker/compose.yaml up -d` ; la factory n'est pas gênée                              |
| Déblocage : 503                                       | ni connexion GitHub ni jeton de repli                                                 | Réglages, « Se connecter à GitHub » (`/api/github/login`)                                               |
| GitHub : « Installation de l'App illisible » ou repli | App créée mais pas installée                                                          | `/api/github/status` donne `installUrl` : installer sur « All repositories »                            |
| Connexion GitHub : « Seul le compte cddev … »         | autre compte GitHub ouvert dans ce navigateur                                         | se déconnecter de GitHub, puis relancer la connexion                                                    |
| Déblocage : 😕 sur le commentaire                     | plus aucune carte bloquée sur l'issue                                                 | rien à faire, la carte est déjà repartie                                                                |
| En-tête « Factory muette »                            | ni sonde ni webhook depuis 10 min (gateway arrêté)                                    | `hermes gateway status` ; voir « Sonde muette »                                                         |
| En-tête « Hors ligne » sur l'iPhone                   | hors du tailnet, ou conteneur arrêté                                                  | Tailscale actif sur l'iPhone ; `docker ps --filter name=factory-live`                                   |
| Aucun push sur l'iPhone                               | app pas installée, permission refusée, mode Concentration                             | Réglages de l'app (elle dit ce qui manque) ; Réglages iOS, Notifications, factory-live                  |
| Erreur du front sur un appareil                       | remontée au journal du serveur                                                        | `docker logs factory-live \| grep '"component":"client"'`                                               |
| Écriture refusée (403) depuis l'iPhone                | login Tailscale absent de `TAILSCALE_LOGINS`                                          | `TAILSCALE_LOGINS` dans `docker/.env`, puis `up -d`                                                     |
| Réponse 421 « Hôte inconnu » (`host_refused`)         | adresse hors liste : port publié différent, autre nom que localhost ou le nom tailnet | ajouter `nom:port` à `ALLOWED_HOSTS` (ou l'origine à `PUBLIC_ORIGINS`) dans `docker/.env`, puis `up -d` |
| Déblocage refusé : « la cause est encore là »         | diagnostic : cause présente côté factory (`cause_present`)                            | suivre « Que faire » de l'intervention, ou « Débloquer quand même » en connaissance de cause            |
| Diagnostic « inexpliqué »                             | aucune règle ne reconnaît ce blocage                                                  | lire les derniers signaux affichés ; puis « Ajouter une règle » (section Diagnostic des blocages)       |
| Heures du journal décalées d'une heure                | `HERMES_TZ` ne suit pas le fuseau de ce PC                                            | corriger `HERMES_TZ` dans `docker/.env`, puis `up -d`                                                   |
