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

Le nom tailnet de ce PC, le login Tailscale autorisé à écrire et l'adresse du dashboard de la factory n'entrent jamais dans le dépôt, qui est public : leurs vraies valeurs sont dans `docker/.env`, ignoré par git, que compose lit à chaque `up`. Modèle commenté : `docker/.env.example`. Sans `docker/.env`, factory-live ne répond qu'à ce PC (`http://localhost:8446`) et n'accepte d'écriture que de lui.

| Variable            | Rôle                                                                                                               | Forme                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `PUBLIC_ORIGINS`    | adresses de la PWA : ce PC, puis l'adresse tailnet (Réglages, « Installer l'app », retours de GitHub, hôtes admis) | `http://localhost:8446,https://<machine>.<tailnet>.ts.net:8446` |
| `TAILSCALE_LOGINS`  | logins Tailscale autorisés à écrire depuis les autres appareils                                                    | `<login>@github`                                                |
| `DASHBOARD_URL`     | dashboard de la factory, lien des interventions ; vide : pas de lien                                               | `https://<machine>.<tailnet>.ts.net:<port>`                     |
| `ALLOWED_HOSTS`     | hôtes acceptés en plus (`nom:port`), par exemple si le port publié change                                          | vide                                                            |
| `WORKFLOW_CORE_URL` | adresse du socle vue du conteneur                                                                                  | `http://host.docker.internal:8447` (défaut)                     |

Après un changement : `docker compose -f docker/compose.yaml up -d`. Le fichier ne s'affiche pas en entier (`grep -c` ou `cut -d= -f1` pour vérifier ses clés). `npm run check:text` refuse tout nom tailnet ou login Tailscale réel dans le dépôt : doc, tests et démo n'emploient que le gabarit ci-dessus, l'exemple fictif `machine.tailnet.ts.net` et `alice@github`.

## Installer l'app et activer les notifications

| Appareil     | Installer                                                                                                            | Notifications                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| iPhone, iPad | Safari sur l'adresse tailnet, Partager, « Sur l'écran d'accueil », puis ouvrir factory-live depuis l'écran d'accueil | Réglages de l'app, « Activer les notifications », accepter ; « Envoyer un test » |
| Ce PC        | `http://localhost:8446` dans Edge ou Chrome, icône d'installation dans la barre d'adresse                            | idem ; Windows doit autoriser les notifications d'Edge ou de Chrome              |
| Mac          | adresse tailnet dans Safari (Fichier, « Ajouter au Dock ») ou Chrome                                                 | idem                                                                             |

L'en-tête dit l'état du lien : « En direct », « Connexion… », « Hors ligne · dernier état il y a … » (l'app montre le dernier état reçu), « En pause » (factory en pause), « Factory muette » (le socle ne voit plus le gateway de la factory : voir Pannes).

## Tests de bout en bout

`npm run e2e` lance Playwright sous Chromium : la démo (bureau et iPhone), et l'app « live », servie par le vrai serveur de factory-live (lancé par `e2e/live-server.mjs` avec une base et des secrets temporaires) et branchée sur un faux workflow-core (`e2e/fake-api.mjs`, scénario dans `e2e/fake-core-scenario.mjs`). Le faux socle vérifie chacune de ses réponses avec les JSON Schema copiés du socle, répond aussi aux appels à GitHub, et se pilote par ses routes `/__control/…` : couper et rétablir le socle, annoncer un changement de carte, ouvrir une nouvelle époque par un `reset`, lire les commentaires postés. Les quatre projets `live-*` partagent ce montage et passent l'un après l'autre. WebKit (Safari, iPhone) et les captures de référence tournent dans l'image officielle de Playwright, comme en CI (il manque à WSL des bibliothèques pour WebKit) :

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

| Montage                    | Mode     | Pourquoi                                                                   |
| -------------------------- | -------- | -------------------------------------------------------------------------- |
| volume `factory-live-data` | écriture | la base de factory-live (`factory-live.db`) : historique, push, déblocages |
| `~/.config/factory-live`   | lecture  | secrets : `workflow-core-secret`, `github-token` (repli facultatif)        |

Rien de la factory n'est monté (#72) : ni `~/.hermes`, ni le dépôt de la factory, ni les transcriptions de Claude Code. factory-live lit la factory par le socle, à `WORKFLOW_CORE_URL` (`host.docker.internal:8447` vu du conteneur).

## Diagnostic des blocages

Chaque intervention dit sa cause, qui agit, si « Débloquer » suffit et quoi faire (ADR 0009). Le socle l'établit sur les faits de la factory, sans modèle, et factory-live l'affiche tel quel ; tant que la cause est présente côté factory, le serveur refuse le déblocage (`cause_present`), sauf « Débloquer quand même ».

| Besoin                        | Commande ou fichier                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Lire le diagnostic en cours   | `curl -s localhost:8446/api/snapshot \| jq '.interventions[] \| {id, cause: .diagnosis.primary.code, when: .diagnosis.unblock.when}'` |
| Verdicts des runs d'une issue | `curl -s localhost:8446/api/issues/<dépôt>/<numéro> \| jq '.cards[].runs[] \| {id, outcome, verdict: .verdict.finding}'`              |

Un blocage sort « inexpliqué », ou une règle manque : elle s'ajoute dans le socle (`code-my-life/workflow-core`), pas ici. Les phrases d'un code nouveau s'ajoutent au catalogue (`packages/contracts/src/messages.ts`), puis dans `fr.ts` et `en.ts`.

La tuile Santé « Délais des gardes » montre les gardes à risque que le socle calcule : pour chaque agent, le délai effectif de ses hooks et la plus longue commande que le code de chaque garde peut lancer.

## Recette des PR

La recette d'une PR (ADR 0011, ADR 0012) se lit sous le détail de son issue. Le serveur la recalcule à chaque lecture de GitHub (30 s pour une issue active).

| Besoin                               | Commande ou fichier                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Lire la recette d'une issue          | `curl -s localhost:8446/api/issues/<dépôt>/<numéro> \| jq '.acceptance \| {criteria, gate}'`            |
| Rapports de tests lus par la recette | artefacts `junit-unit` et `junit-e2e` des runs de la tête (`.github/workflows/ci.yml`), gardés 30 jours |
| Format de la gate                    | `apps/server/src/adapters/github/acceptance.ts`, au format de `scripts/factory-gate.py` de la factory   |
| Disposition gardée                   | table `meta` de `factory-live.db`, clés `layout:acceptance:phone` et `layout:acceptance:desktop`        |

Un critère reste « non prouvé » alors que sa PR cite un test : le nom entre « » doit être celui du test (sans les `describe`) et son fichier doit finir le chemin du rapport. Un autre dépôt n'a sa recette complète que si sa CI publie ses rapports JUnit en artefacts nommés `junit…`, à chaque exécution.

### Jumeaux vivants

Les jumeaux d'une PR (ADR 0013) tournent sur le banc de la factory (`scripts/factory-twins.py`), jamais dans factory-live. Le widget « Jumeaux interactifs » les montre dès que la factory a écrit l'état de la paire.

| Besoin                        | Commande ou fichier                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| État de la paire, lu ici      | données déclarées de la factory dans le socle (`pr:<dépôt>#<pr>`, #60) : la paire et le port du miroir |
| Démarrer ou arrêter une paire | `python3 scripts/factory-twins.py up\|down <dépôt> <pr> [--tailnet]`, depuis le dépôt de la factory    |
| Miroir en direct              | `curl -s localhost:8446/api/twins/<dépôt>/<pr>/state`                                                  |
| Hôte des ports du banc        | `TWINS_HOST` : `host.docker.internal` dans le conteneur (`docker/compose.yaml`)                        |

Un écran reste sur « Connexion au jumeau… » : la paire tourne-t-elle (`factory-twins.py status`) ? Depuis un autre appareil, la paire doit être démarrée avec `--tailnet`.

### Studio et workflows

Le studio de video-factory est suivi par son API (ADR 0014) pour ses vidéos, ses médias et le geste, servie sur ce PC par `vf studio serve` (service `video-factory-studio`, port 8448) ; sa fiche vient du socle (#72). factory-live ne lit ni son tableau ni ses fichiers.

| Besoin                          | Commande ou fichier                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Workflows suivis                | `WORKFLOWS` : `studio=http://host.docker.internal:8448` (`docker/compose.yaml`), virgules entre eux  |
| Ce que factory-live en lit      | `curl -s localhost:8446/api/workflows/studio \| jq '{unreachableSince, error, items}'`               |
| L'API du studio elle-même       | `curl -s localhost:8448/api/items`                                                                   |
| Fiches de la ligne et du studio | servies par le socle (`/api/workflows/factory/sheet`, `/api/workflows/studio/sheet`), jugées par lui |
| Fiche de la ligne reçue         | `curl -s localhost:8446/api/workflows \| jq .code` (`null` : pas encore reçue, la ligne l'attend)    |

Le studio est « injoignable » dans la Santé : le service tourne-t-il (`systemctl --user status video-factory-studio`) ? La page Studio garde le dernier état reçu en attendant.

## La lecture par le socle

factory-live lit la factory par le socle (`workflow-core`, port 8447 de ce PC), seulement (#72) : son API et son flux, derrière le secret `workflow-core-secret`. Il exige au démarrage `WORKFLOW_CORE_URL` et ce secret, et s'arrête en nommant ce qui manque. Il n'y a plus d'interrupteur : une variable `LIVE_SOURCE` encore posée dans `docker/.env` est ignorée.

- **Contrôle** : `curl -s http://127.0.0.1:8446/healthz` répond `"ok": true` ; il passe en échec après 60 secondes sans le socle (#62), et la page Santé montre la tuile « Socle ».
- **Socle arrêté** : la ligne garde la dernière fiche et le dernier état reçus, une intervention « Socle injoignable » s'ouvre ; au démarrage sans socle, la ligne attend sa première fiche, sans page cassée.
- **Retour arrière** (R4 de l'epic) : relancer le code d'avant le retrait (`git checkout <commit d'avant>`, puis `docker compose -f docker/compose.yaml up -d --build`), avec ses montages et ses variables ; la base de factory-live garde les tables de l'ancien miroir du kanban.

## Secrets

- GitHub App `factory-live` (ADR 0003) : ses clés et les jetons de Clément sont dans la base du volume (`factory-live.db`, mode 600). Mise en place, une fois :
  1. ouvrir `http://localhost:8446/api/github/setup` (ou l'adresse tailnet), « Continuer sur GitHub », garder le nom proposé, « Create GitHub App » ;
  2. GitHub enchaîne sur l'installation : choisir « All repositories », « Install » ;
  3. ouvrir `/api/github/login` (Réglages, « Se connecter à GitHub ») et autoriser l'App : le déblocage part alors au nom de cddev.
     État : `curl -s localhost:8446/api/github/status`. Déconnexion : Réglages, ou `POST /api/github/logout`. Révocation complète : supprimer l'App dans les réglages de l'organisation sur GitHub.
- `~/.config/factory-live/github-token` : facultatif, jeton fine-grained de `cddev` servant de repli tant que l'App n'est pas en place (propriétaire `code-my-life` ; Metadata, Issues lecture et écriture, Pull requests, Actions, Contents et Webhooks en lecture), `chmod 600`. Après l'avoir déposé : `docker restart factory-live`.
- Clés VAPID (push) : générées au premier démarrage dans la base du volume.
- `~/.config/factory-live/workflow-core-secret` : le secret partagé du socle (`WORKFLOW_CORE_SECRET` de `~/.config/workflow-core/.env`), copié sans retour à la ligne, mode 600, jamais affiché (tâche code-my-life/factory-live#58). Absent : le démarrage s'arrête en le nommant.

## Pannes

| Symptôme                                              | Cause probable                                                                        | Action                                                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Déblocage : 503                                       | ni connexion GitHub ni jeton de repli                                                 | Réglages, « Se connecter à GitHub » (`/api/github/login`)                                                                       |
| GitHub : « Installation de l'App illisible » ou repli | App créée mais pas installée                                                          | `/api/github/status` donne `installUrl` : installer sur « All repositories »                                                    |
| Connexion GitHub : « Seul le compte cddev … »         | autre compte GitHub ouvert dans ce navigateur                                         | se déconnecter de GitHub, puis relancer la connexion                                                                            |
| Déblocage : 😕 sur le commentaire                     | plus aucune carte bloquée sur l'issue                                                 | rien à faire, la carte est déjà repartie                                                                                        |
| En-tête « Factory muette »                            | le socle voit le gateway de la factory arrêté                                         | état du gateway sur la machine de la factory ; tuile « Gateway » de la page Santé                                               |
| En-tête « Hors ligne » sur l'iPhone                   | hors du tailnet, ou conteneur arrêté                                                  | Tailscale actif sur l'iPhone ; `docker ps --filter name=factory-live`                                                           |
| Aucun push sur l'iPhone                               | app pas installée, permission refusée, mode Concentration                             | Réglages de l'app (elle dit ce qui manque) ; Réglages iOS, Notifications, factory-live                                          |
| Erreur du front sur un appareil                       | remontée au journal du serveur                                                        | `docker logs factory-live \| grep '"component":"client"'`                                                                       |
| Écriture refusée (403) depuis l'iPhone                | login Tailscale absent de `TAILSCALE_LOGINS`                                          | `TAILSCALE_LOGINS` dans `docker/.env`, puis `up -d`                                                                             |
| Réponse 421 « Hôte inconnu » (`host_refused`)         | adresse hors liste : port publié différent, autre nom que localhost ou le nom tailnet | ajouter `nom:port` à `ALLOWED_HOSTS` (ou l'origine à `PUBLIC_ORIGINS`) dans `docker/.env`, puis `up -d`                         |
| Déblocage refusé : « la cause est encore là »         | diagnostic : cause présente côté factory (`cause_present`)                            | suivre « Que faire » de l'intervention, ou « Débloquer quand même » en connaissance de cause                                    |
| Santé : « Délais des gardes » en jaune                | une garde peut lancer une commande d'au moins le délai effectif de son hook           | relever `plugins.hook_callback_timeout` (600 s au plus) et `timeouts.tools.sequential_call`, ou sortir le contrôle long du hook |
