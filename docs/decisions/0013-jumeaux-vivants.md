# ADR 0013 : les jumeaux vivants dans la recette

Date : 2026-11-04. Statut : accepté (issue #23, décisions du propriétaire du 2026-11-04 : « Resynchroniser » ramène les deux jumeaux à l'accueil de l'app ; la factory démarre la paire à la gate verte et l'arrête à la fusion ou à la fermeture, hermes-software-factory#29).

## Contexte

Le banc de jumeaux de la factory (hermes-software-factory#26) fait tourner l'app à la base et à la tête d'une PR, chacune dans un Chromium Neko diffusé en WebRTC. Un miroir tient le contrôle des deux sessions : il rejoue un geste sur l'autre jumeau et se suspend quand les deux écrans diffèrent sous le pointeur. Son API (`POST /gesture`, `/mirror`, `/resync`, `GET /state`) n'écoute que sur ce PC. La recette (ADR 0011, 0012) n'affichait que des images fixes.

## Décision

- **L'état de la paire** est le fichier `twins/<dépôt>-<pr>.json` du dossier du tableau, que la factory écrit (hermes-software-factory#29). Il contient l'état au format `AcceptanceTwins`, plus le port du miroir. Il est lu par la liste blanche (`HermesPaths.twins`) et validé. Sans fichier, il n'y a pas de jumeaux : `twinsAbsent: 'no_build'`.
- **Le serveur se connecte à Neko à la place de la PWA.** Neko ne répond pas au CORS, et le mot de passe de session reste sur le serveur. `GET /api/twins/:repo/:pr/session/:side` se connecte à Neko et renvoie à la PWA un jeton de session (un spectateur) et l'adresse du WebSocket du jumeau. Cette adresse reprend l'hôte par lequel la PWA est venue : `localhost` sur ce PC, le nom tailnet ailleurs.
- **La PWA est elle-même le client Neko**, sans iframe :
  - un WebSocket vers le jumeau ;
  - un `RTCPeerConnection` qui répond à l'offre de Neko ;
  - les candidats ICE arrivés avant l'offre sont gardés jusqu'à elle ;
  - le battement de cœur de Neko reçoit sa réponse.

  Sur ce PC, le candidat annoncé (l'adresse tailnet) devient `127.0.0.1` : le tailnet ne répond pas au PC lui-même.

- **Les gestes passent par le serveur, puis par le miroir**, jamais par la session Neko de la PWA, qui ne fait que regarder :
  - `POST /api/twins/:repo/:pr/gesture`, `/mirror` et `/resync` relaient vers le miroir (`TWINS_HOST`, `host.docker.internal` dans le conteneur) ;
  - ils sont gardés comme le déblocage : ce PC, ou un login Tailscale autorisé ;
  - le pointeur est envoyé au plus une fois par image (`requestAnimationFrame`), aux coordonnées de l'écran du jumeau ;
  - les gestes partent dans l'ordre, un à la fois : un appui n'arrive jamais avant le déplacement qui y mène, ni un relâchement avant son appui. Derrière un geste en route, un déplacement remplace le précédent.
- **L'état du banc en direct** : la PWA lit `GET /api/twins/:repo/:pr/state` chaque seconde pendant que le widget est déplié. Elle y lit le miroir, la divergence et le décalage entre les deux jumeaux.
- **La dernière image** : `GET /api/twins/:repo/:pr/shot/:side` sert la capture de Neko, demandée au miroir (Neko ne la sert qu'à un admin). Elle s'affiche avant la connexion ; si le flux tombe, l'écran garde sa dernière image et le dit.
- **Resynchroniser** ramène les deux jumeaux à l'accueil de l'app et rallume le miroir. Rejouer le journal sur deux écrans différents reproduisait la divergence.

- **La politique de la page** (`connect-src`) admet le WebSocket des jumeaux : `ws(s)://<hôte de la PWA>:*`, pour les seuls hôtes de `PUBLIC_ORIGINS`.

Écartés :

- L'iframe du client web de Neko : il ne laisse pas passer les gestes par le miroir, et l'issue l'exclut.
- La connexion à Neko depuis la PWA avec le mot de passe : Neko refuse le CORS, et le mot de passe irait au navigateur.
- Relayer le WebRTC par le serveur : le flux va directement du jumeau au navigateur, par le mux TCP de Neko.

## Conséquences

- Le format du fichier d'état se change des deux côtés, factory et factory-live.
- Sans la factory (démo, tests), le widget garde ses images fixes.
