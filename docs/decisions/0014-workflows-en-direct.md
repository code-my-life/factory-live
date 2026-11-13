# ADR 0014 : les workflows suivis par leur API, et la fiche publiée de la ligne du code

Date : 2026-11-05. Statut : accepté (issue #31, décisions du propriétaire : le studio de video-factory est le premier workflow suivi ; la ligne du code se dessine depuis la fiche que publie la factory), remplacée par l'ADR 0018.

## Contexte

La page Studio (#30) dessinait le studio de la démo depuis une fiche embarquée. video-factory sert désormais une API générique, version 1 (son ADR 0006, `vf studio serve` sur le port 8448) : la fiche, les éléments, le détail d'un élément, ses mots calés, ses fichiers et le geste du propriétaire. La factory publie de son côté la fiche de la ligne du code (`config/workflow.json` de hermes-software-factory, son #31).

## Décision

- **Un workflow se déclare par son adresse**, dans `WORKFLOWS` (`studio=http://host.docker.internal:8448`, `docker/compose.yaml`). factory-live ne lit jamais la base ni les fichiers d'un workflow : un workflow qui change sa fiche ou son stockage ne demande aucun changement ici.
- **Le serveur lit la fiche et les éléments** (`WorkflowApi`, `adapters/workflows/api.ts`) toutes les 5 s quand quelqu'un regarde le workflow depuis moins d'une minute, toutes les 30 s sinon. La fiche est relue à chaque fois : une station ajoutée apparaît au passage suivant. Une fiche invalide garde la dernière valide et dit pourquoi. Une API d'une autre version est refusée.
- **Injoignable, le dernier état reste.** Le serveur garde la dernière fiche et les derniers éléments, et note depuis quand le workflow ne répond pas. La page Studio et la Santé le disent.
- **Les routes** (`http/app.ts`) :
  - `GET /api/workflows` : chaque workflow suivi, et la fiche de la ligne du code ;
  - `GET /api/workflows/:wf` : la fiche, les éléments et l'état de la lecture ;
  - `GET /api/workflows/:wf/items/:id` : le détail ; ses fichiers pointent vers ce serveur, et le lien vers la page du studio reprend l'hôte par lequel la PWA est venue ;
  - `GET /api/workflows/:wf/items/:id/words` : les mots calés ;
  - `GET /api/workflows/:wf/items/:id/media/:name` : le fichier relayé en plages d'octets (`Range`, 206, `Content-Range`), pour que le lecteur saute sans tout charger ;
  - `POST /api/workflows/:wf/items/:id/gesture` : « ok » ou « refaire » avec sa raison, vérifié ici puis relayé. Il est gardé comme le déblocage : ce PC, ou un login Tailscale autorisé. Le refus du workflow revient tel quel (`workflow_refused`).

  Seuls un identifiant et un nom de fichier au format du workflow atteignent son API.

- **Une seule notification par arrivée** (`application/notifications.ts`). Un élément qui arrive à une station du propriétaire (`kind: owner`) envoie une notification push. L'arrivée est l'élément, sa station et l'heure d'arrivée : la même vidéo renvoyée plus tard à la même station est une nouvelle arrivée. La clé est réservée dans la base, donc un redémarrage ne renvoie rien. Une arrivée de plus de 6 heures n'est plus une nouvelle.
- **La PWA lit le studio par ce serveur** sur le build live, toutes les 5 s quand la page est visible. Un serveur qui ne suit aucun studio cache son onglet.
- **La ligne du code se dessine depuis la fiche publiée** par la factory, lue dans son dépôt monté en lecture seule (`/factory/config/workflow.json`, 256 Kio au plus). Absente, illisible ou invalide, la copie embarquée (`workflows/code-line.json`) revient, et la Santé dit pourquoi.

Écartés :

- Lire le tableau `studio` d'Hermès et les fichiers de video-factory directement : factory-live dépendrait du stockage d'un autre dépôt.
- Envoyer la vidéo entière à la PWA : un master de plusieurs centaines de Mo, alors que le lecteur saute d'un mot à l'autre.
- Pousser le studio par le flux SSE : la lecture par la PWA suffit au rythme du studio, et le flux reste celui de la factory.

## Conséquences

- Un nouveau workflow se branche par une ligne de `WORKFLOWS`, s'il sert l'API version 1.
- Le contrat de l'API se change des deux côtés, video-factory et factory-live.
- Sans studio (démo, tests), la page Studio garde son studio de démo.
