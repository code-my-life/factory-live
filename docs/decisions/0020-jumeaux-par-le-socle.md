# ADR 0020 : l'état des jumeaux vient du socle

Date : 2026-11-12. Statut : accepté. Amende l'ADR 0013. Fondée sur l'ADR 0011 de workflow-core
([0011](https://github.com/code-my-life/workflow-core/blob/main/docs/decisions/0011-factory-live-lit-par-une-seule-porte-le.md)). Epic code-my-life/factory-live#55, issue #56.

## Contexte

Les **jumeaux** sont l'app à la base et à la tête d'une PR, côte à côte. L'ADR 0013 lit l'état d'une paire dans le
fichier `twins/<dépôt>-<pr>.json` du dossier du board d'Hermès. L'ADR 0011 de workflow-core fait passer ce qu'un
workflow montre en plus de ses cartes par des **données déclarées**, publiées par le socle en types génériques.

## Décision

- L'état d'une paire de jumeaux vient du socle, en données déclarées par la factory, au lieu du fichier lu dans le
  dossier du board.
- Ne changent pas : la connexion à Neko par le serveur, la PWA comme client Neko, le relais des gestes vers le miroir
  et sa garde, la dernière image, la resynchronisation et la politique de la page.
- Le widget vivant des jumeaux reste propre à la factory jusqu'à l'epic de la factory sur le socle.

## Écartés

- Garder la lecture du fichier dans le dossier du board : une lecture d'Hermès hors du socle.

## Conséquences

- Le format de l'état se change entre la factory et le socle ; factory-live lit ce que le socle publie.
