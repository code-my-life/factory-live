# ADR 0004 : PWA, push et exposition

Date : 2026-10-28. Statut : accepté.

## Décision

- Conteneur Docker publié sur `127.0.0.1:8446` ; tailnet par `tailscale serve --bg --https=8446 http://127.0.0.1:8446` depuis WSL, jamais Funnel.
- Ce PC : `http://localhost:8446` (Tailscale tourne seulement dans WSL). iPhone et Mac : l'adresse tailnet, `https://<machine>.<tailnet>.ts.net:8446`, réglée dans `docker/.env` (jamais dans le dépôt).
- Web Push (VAPID, `web-push`) seulement pour les blocages qui attendent Clément : needs_input, capability, transient, boucle de blocage, carte retenue plus de 30 min, abandon. Telegram et `factory-notify` restent inchangés.
- Accès sans mot de passe ; écritures réservées à localhost et au login Tailscale autorisé (en-tête `Tailscale-User-Login`).
- Contrôle de l'hôte sur toutes les routes, lectures et `/healthz` compris (2026-10-29) : l'en-tête `Host` doit désigner ce PC au port du service (`localhost`, `127.0.0.1`, `[::1]`), l'hôte d'une origine publique (le nom tailnet) ou un hôte d'`ALLOWED_HOSTS`, sinon 421 `host_refused`. Contre le DNS rebinding : une page piégée qui fait pointer son domaine sur 127.0.0.1 envoie son propre nom, et ne lit donc ni l'instantané ni les transcriptions.

## L'app installée (phase 5, 2026-10-28)

- Le conteneur sert la PWA branchée sur les vraies données (`VITE_DATA_SOURCE=live`) ; la démo reste pour la maquette et les e2e.
- Manifeste (`display: standalone`, icônes 192, 512 et masquable, `apple-touch-icon`) et service worker maison (`vite-plugin-pwa`, stratégie `injectManifest`, Workbox) : la coque de l'app reste disponible hors ligne ; l'API ne passe jamais par le cache. Une nouvelle version prend la main tout de suite et la page se recharge une fois.
- Hors ligne, l'app s'ouvre sur le dernier état reçu, gardé sur l'appareil (`localStorage`), et l'en-tête le dit : « En direct », « Connexion… », « Hors ligne · dernier état il y a … », « En pause », « Factory muette » (le serveur ne reçoit plus rien de la factory).
- Une perte de réseau ne coupe pas toujours la connexion SSE (sortie du tailnet, iPhone en veille) : le serveur envoie un événement `ping` après 15 s sans rien d'autre ; un flux muet 45 s est relancé, et l'app se dit hors ligne 10 s plus tard s'il ne revient pas.
- Notifications : la permission est demandée sur le toucher « Activer les notifications » (exigé par iOS), l'abonnement est enregistré par le serveur, « Envoyer un test » passe par le serveur. Le service worker affiche le push, ouvre l'intervention au toucher et pose la pastille de l'icône (blocages qui t'attendent) ; l'app ouverte la tient à jour.
- Sur iPhone, Safari seul ne reçoit pas de push : Réglages le dit et renvoie à l'installation sur l'écran d'accueil. Barre d'état translucide : l'en-tête passe sous l'heure ; en thème clair, la bande de l'encoche reste sombre pour que l'heure, toujours blanche, se lise.
- Les erreurs du front remontent au journal du serveur (`/api/client-logs`, cinq par minute au plus).

## Pourquoi

Le Web Push des apps posées sur l'écran d'accueil existe sur iOS depuis 16.4, sans compte développeur Apple, à condition que le manifeste déclare `display: standalone` et que la permission soit demandée sur un geste. Le badge de l'icône est disponible.

## Vérifié le 2026-10-28

- Un conteneur publié sur `127.0.0.1:8446` répond depuis WSL (`curl http://127.0.0.1:8446`) et depuis Windows (`cmd.exe /c curl http://localhost:8446`).
- Le service tourne : image `factory-live:local` (Node 24.22.1 épinglé par digest, 363 Mo), conteneur `healthy`, utilisateur 1000:1000, racine en lecture seule, sans capacité ; `/healthz` répond depuis WSL et depuis Windows ; le kanban réel est lu à travers le montage (71 cartes) ; un webhook signé avec le vrai secret est accepté (202), une signature fausse refusée (401).
- `tailscale serve --bg --https=8446 http://127.0.0.1:8446` actif, « tailnet only ».
- Vérifié par Clément : `/api/snapshot` répond depuis l'iPhone à l'adresse tailnet, à travers `tailscale serve`.
- PWA en direct (Chromium, ce PC) : les huit écrans sur les vraies données sans erreur de console, service worker actif ; hors ligne, la page rechargée s'ouvre sur le dernier état (« Hors ligne · dernier état il y a 17 s ») ; conteneur mis en pause (flux muet sans erreur) : « Connexion… » vers 50 s, « Hors ligne » vers 60 s, « En direct » dès la reprise.
- Reste à vérifier sur les appareils : le SSE à travers `tailscale serve`, l'en-tête `X-Forwarded-For` posé par `tailscale serve` (hypothèse de la garde des écritures), l'installation et le push sur iPhone (WebKit ne tourne pas sur ce PC), le Mac.
