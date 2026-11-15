# Architecture

## Vue d'ensemble

```
WSL (hôte)                                            Conteneur factory-live (Docker Desktop)
+-----------------------------------------+           +--------------------------------------+
| la factory (Hermès, ses agents, kanban) |           | lecture du socle : état complet,     |
+-----------------------------------------+           |   puis flux SSE (Last-Event-ID)      |
| workflow-core, le socle (port 8447)     | HTTP +    | domaine : stations, interventions,   |
|   lit la factory, juge les fiches,      |---------->|   modèle effectif, stats             |
|   calcule diagnostics et santé          | secret    | serveur Hono : REST + SSE, push,     |
+-----------------------------------------+ partagé   |   historique (SQLite), client GitHub |
| video-factory (studio, port 8448)       |---------->| PWA React + Primer + Motion          |
+-----------------------------------------+ éléments  +--------------------------------------+
tailscale serve https:8446 -> 127.0.0.1:8446          sortant : api.github.com, Web Push
Windows : http://localhost:8446
iPhone, Mac : https://<machine>.<tailnet>.ts.net:8446
```

- factory-live lit la factory par le socle, `code-my-life/workflow-core` (ADR 0015, #72), et rien d'autre : aucun dossier de la factory, de son dépôt ni des transcriptions n'est monté dans le conteneur. Seul l'adaptateur du socle connaît la factory ; la CI le vérifie (`apps/server/src/runtimeName.test.ts`).
- Si factory-live est arrêté, ni la factory ni le socle ne sont gênés ; au redémarrage, factory-live relit l'état complet du socle. Si le socle ne répond pas, le dernier état reçu reste affiché, la santé et une intervention le disent, et `/healthz` répond 503 après une minute.

## Couches

| Couche                        | Rôle                                                                             | Dépend de            |
| ----------------------------- | -------------------------------------------------------------------------------- | -------------------- |
| `packages/domain`             | Règles pures : stations, interventions, modèle effectif, stats, gardes           | rien                 |
| `packages/contracts`          | Schémas zod de l'API et du SSE, types du socle ; OpenAPI 3.1                     | zod                  |
| `apps/server/src/application` | Hub temps réel, projections, cas d'usage, ports (`ports.ts`), sans entrée-sortie | domain, contracts    |
| `apps/server/src/adapters`    | Socle (workflow-core), studio, GitHub, banc de jumeaux, push, stockage           | ports, bibliothèques |
| `apps/server/src/http`        | Hono : REST, SSE                                                                 | application          |
| `apps/web`                    | PWA                                                                              | contracts            |

Les règles sont vérifiées en CI par dependency-cruiser (`.dependency-cruiser.cjs`) : l'application n'importe ni adaptateur, ni `http`, ni module Node (fichiers, réseau, SQLite) ; tout passe par ses ports. Sabotage vérifié : un import d'adaptateur ou de `node:fs` dans `application/` fait échouer `npm run check:arch`.

## Sources et corrélation

| Besoin                                   | Source                                                                   | Méthode                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Cartes, runs, transitions                | socle : éléments du workflow `factory`                                   | état complet au démarrage et après un `reset`, puis un événement par élément changé      |
| Fiche de la ligne du code et du studio   | socle : `/api/workflows/<workflow>/sheet`, jugée par lui (ADR 0006)      | la dernière reçue reste ; rien avant la première (la ligne attend)                       |
| Agents en direct, activité, coûts        | socle : `live`, `activity`, `usage`, `agents`                            | flux SSE, coûts relus chaque minute                                                      |
| Interventions et diagnostics             | socle : `interventions`, `diagnoses`, `run-verdicts`                     | les diagnostics et verdicts sont ceux du socle, aucun n'est recalculé ici                |
| Recette, jumeaux, transcriptions, dérive | socle : données déclarées de la factory (#60)                            | lues à la demande, avant d'afficher                                                      |
| Santé de la machine                      | socle : `/api/machine` et ses contrôles                                  | relue toutes les 30 s, mise à jour par le flux                                           |
| Vidéos du studio                         | API générique de video-factory (`WORKFLOWS`, ADR 0014)                   | éléments, médias et geste ; sa fiche vient du socle                                      |
| PR, CI, réactions                        | API REST GitHub                                                          | ETag, API Actions pour la CI                                                             |
| Recette d'une PR                         | API REST et GraphQL GitHub, artefacts JUnit de la CI, preuves de la gate | partie par partie, chaque lecture isolée ; rapports lus une fois par artefact (ADR 0012) |

Le socle est lu par `adapters/workflow-core/` : l'état complet au démarrage, puis son flux SSE (`Last-Event-ID` à la
reprise, relecture complète après un `reset`), chaque réponse vérifiée par le schéma que `z.fromJSONSchema` tire de la
copie du JSON Schema du socle (`packages/contracts/src/workflow-core/`, types générés par `npm run types:core`).
factory-live garde son propre historique des éléments servis (`item_history`, ADR 0019) : une carte que la factory
purge reste dans l'historique. Les tables de l'ancien miroir du kanban restent dans une base existante, plus rien ne les
lit ni ne les écrit.

## Front

- Une seule interface de données (`apps/web/src/data/source.ts`) : la démo (`DemoSource`) et l'API (REST + SSE) la réalisent.
- Primer React pour les composants, jetons Primer pour les styles. La ligne d'usine est un graphe (`features/line/graph`, ADR 0010) dessiné depuis la fiche que sert le socle : boîtes des stations placées par une géométrie pure (`layout.ts`), liens courbes en SVG, et Motion pour les cartes qui voyagent sur les liens, le trajet de l'issue ouverte et le zoom. Aucune fiche n'est embarquée : avant la première, la ligne dit qu'elle l'attend ; la démo a les siennes (`apps/web/src/demo/sheets/`).
- Langues (ADR 0008) : français et anglais, dictionnaires typés (`apps/web/src/i18n`) et API Intl. Le serveur n'écrit pas de phrases pour la PWA : ce qu'il fabrique circule en codes et paramètres (`Message`, `Text` dans les contrats), écrits par la PWA et par le service worker dans la langue choisie sur l'appareil.

## Diagnostic des blocages (ADR 0009)

Chaque intervention qui s'explique porte un diagnostic : la cause, qui agit, si « Débloquer » suffit, les étapes et leurs commandes, les preuves, le verdict de chaque run. Le socle l'établit par des règles sur les faits de la factory, sans modèle ; factory-live le reçoit tel quel (`diagnoses`, `run-verdicts`) et l'affiche : chaque phrase est un gabarit du catalogue, chaque citation un texte de la factory tel quel. factory-live ne calcule plus que deux interventions sur les cartes que sert le socle : une PR à approuver et une CI de main rouge.

Les gardes à risque (tuile Santé « Délais des gardes ») et, garde par garde, les dépassements et la plus longue commande de l'écran Agents viennent aussi du socle (`agents`).
