# ADR 0018 : les workflows et leur fiche viennent du socle

Date : 2026-11-12. Statut : accepté. Remplace l'ADR 0014. Fondée sur les ADR 0006 et 0011 de workflow-core
([0006](https://github.com/code-my-life/workflow-core/blob/main/docs/decisions/0006-un-seul-juge-de-la-fiche-en-python.md),
[0011](https://github.com/code-my-life/workflow-core/blob/main/docs/decisions/0011-factory-live-lit-par-une-seule-porte-le.md)). Epic code-my-life/factory-live#55, issue #56.

## Contexte

L'ADR 0014 faisait lire chaque workflow par sa propre API (`WORKFLOWS`), et la fiche de la ligne du code dans le dépôt
de la factory monté en lecture seule, avec une copie embarquée (`workflows/code-line.json`) en repli. La **fiche** est
le JSON qui décrit les stations d'un workflow. L'ADR 0006 de workflow-core en fait juger la forme et les règles
croisées par le socle seul, qui publie le JSON Schema de la forme.

## Décision

- La fiche et les éléments d'un workflow viennent du socle, la fiche déjà jugée par lui. factory-live n'embarque
  aucune fiche et ne porte aucune règle de fiche.
- Sans réponse du socle, l'écran garde la dernière fiche reçue et dit que le socle est injoignable.
- Les types de factory-live viennent du JSON Schema publié par le socle (`schema/` de workflow-core) : les types
  statiques par `json-schema-to-typescript`, la validation à l'exécution par `z.fromJSONSchema` de zod 4.6.7.
- Un workflow que factory-live ne connaît pas s'affiche dans un écran de workflow générique, depuis sa fiche.
- La vue du studio garde son adaptateur (son API propre, déclarée dans `WORKFLOWS`) jusqu'à l'epic du studio sur le
  socle ; ce que l'ADR 0014 en dit reste vrai pour elle jusque-là.

## Écartés

- Garder la copie embarquée en repli : deux fiches qui divergent, et une règle de fiche de plus ici.
- Écrire les types à la main : ils dériveraient du contrat du socle.

## Conséquences

- Un changement de la forme de la fiche se fait dans le socle ; factory-live régénère ses types.
- Les fiches embarquées et le message d'erreur de fiche partent avec l'ancienne lecture, après la bascule.
