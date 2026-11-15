# ADR 0022 : les valeurs du runtime ne nomment plus Hermès

Date : 2026-11-15. Statut : accepté. Amende l'ADR 0021. Epic code-my-life/factory-live#71, issue #109.

## Contexte

L'ADR 0021 pose une règle de CI (`apps/server/src/runtimeName.test.ts`) qui refuse toute mention d'Hermès hors de la
vue du studio, des dictionnaires et de la démo. Elle admettait provisoirement la chaîne `hermes` dans une **liste
déclarée** de fichiers, chacun avec sa raison : `packages/contracts/src/runtime.ts`, où s'écrit la valeur que
factory-live fabrique lui-même (groupe des tuiles de la page Santé, source de la session d'un agent dans les
transcriptions, source de lignes de la timeline), et le test des routes d'ingestion retirées
(`apps/server/src/http/app.test.ts`). Le socle range ses contrôles sous `runtime` depuis workflow-core#150.

## Décision

- **La valeur devient `runtime`.** `FACTORY_RUNTIME` vaut `runtime` : `ServiceHealth.group`, `TranscriptView.source`
  et `TimelineEntry.source` la portent, le serveur l'écrit, l'app web la lit. Les clés des dictionnaires changent de
  nom, pas leurs textes : la section de la page Santé, l'onglet de la session d'un agent et la source de la timeline
  gardent leurs libellés. La démo et les faux socles des tests écrivent `runtime`.
- **L'exemption part.** La liste déclarée n'existe plus, ni son test ; le test des routes d'ingestion retirées part
  aussi. La règle ne garde que ses dossiers exemptés et le nom du dépôt `hermes-software-factory`.
- **Une valeur déjà gardée reste lisible.** Le dernier état gardé sur l'appareil par la PWA peut porter l'ancien
  groupe : à la lecture, une tuile dont le groupe n'est plus connu rejoint le groupe `runtime`, sans nommer l'ancien.
  La base du serveur ne garde ni groupe ni source : le fil d'activité n'en a pas, la timeline et les transcriptions
  se calculent à chaque lecture.

## Écartés

- Garder `hermes` comme valeur : une valeur énumérée qui nomme le runtime, ce que l'architecture (AD-1) refuse.
- Migrer l'état gardé sur l'appareil : il est remplacé au premier état reçu ; le traduire à la lecture suffit.

## Conséquences

- La règle de CI refuse la chaîne `hermes` dans les fichiers suivis de `apps/`, `packages/`, `docker/`, `e2e/` et
  `scripts/`, hors des dossiers exemptés ; elle ne lit pas le reste du dépôt (documents, site).
- Une app restée ouverte sur une version, face à un serveur de l'autre (après un déploiement, ou pendant l'essai du
  retour arrière), reçoit une source ou un groupe qu'elle ne connaît pas. La nouvelle version les lit comme ceux du
  runtime : la ligne de timeline prend l'icône et le libellé du runtime, la transcription garde l'onglet de la session
  de l'agent, une tuile gardée sur l'appareil rejoint le groupe `runtime`. L'ancienne version n'a pas ces replis : une
  page ouverte sur elle avant le déploiement de la nouvelle doit être rechargée ; rechargée, l'app et le serveur
  servis ensemble sont de la même version.
