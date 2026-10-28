# ADR 0004 : PWA, push et exposition

Date : 2026-10-28. Statut : accepté.

## Décision

- Conteneur Docker publié sur `127.0.0.1:8446` ; tailnet par `tailscale serve --bg --https=8446 http://127.0.0.1:8446` depuis WSL, jamais Funnel.
- Ce PC : `http://localhost:8446` (Tailscale tourne seulement dans WSL). iPhone et Mac : `https://desktop-gja56n4.tail40220c.ts.net:8446`.
- Web Push (VAPID, `web-push`) seulement pour les blocages qui attendent Clément : needs_input, capability, transient, boucle de blocage, carte retenue plus de 30 min, abandon. Telegram et `factory-notify` restent inchangés.
- Accès sans mot de passe ; écritures réservées à localhost et au login Tailscale autorisé (en-tête `Tailscale-User-Login`).

## Pourquoi

Le Web Push des apps posées sur l'écran d'accueil existe sur iOS depuis 16.4, sans compte développeur Apple, à condition que le manifeste déclare `display: standalone` et que la permission soit demandée sur un geste. Le badge de l'icône est disponible.

## Vérifié le 2026-10-28

- Un conteneur publié sur `127.0.0.1:8446` répond depuis WSL (`curl http://127.0.0.1:8446`) et depuis Windows (`cmd.exe /c curl http://localhost:8446`).
- Le service tourne : image `factory-live:local` (Node 24.22.1 épinglé par digest, 363 Mo), conteneur `healthy`, utilisateur 1000:1000, racine en lecture seule, sans capacité ; `/healthz` répond depuis WSL et depuis Windows ; le kanban réel est lu à travers le montage (71 cartes) ; un webhook signé avec le vrai secret est accepté (202), une signature fausse refusée (401).
- `tailscale serve --bg --https=8446 http://127.0.0.1:8446` actif, « tailnet only ».
- Vérifié par Clément : `https://desktop-gja56n4.tail40220c.ts.net:8446/api/snapshot` répond depuis l'iPhone, à travers `tailscale serve`.
- Reste à vérifier : le SSE à travers `tailscale serve`, l'en-tête `X-Forwarded-For` posé par `tailscale serve` (hypothèse de la garde des écritures), le push sur iPhone, le Mac.
