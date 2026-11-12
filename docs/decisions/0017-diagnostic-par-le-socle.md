# ADR 0017 : le diagnostic des blocages vient du socle

Date : 2026-11-12. Statut : accepté. Remplace l'ADR 0009. Fondée sur l'ADR 0012 de workflow-core
([0012](https://github.com/code-my-life/workflow-core/blob/main/docs/decisions/0012-le-diagnostic-des-blocages-est-calcule-par-le.md)). Epic code-my-life/factory-live#55, issue #56.

## Contexte

L'ADR 0009 faisait calculer le diagnostic des blocages par factory-live : des règles pures sur les formats exacts
d'Hermès (`hermesText.ts`), ses bases, ses journaux et le code des greffons des agents. L'ADR 0012 de workflow-core
porte ce calcul dans le socle, pour toute carte de tout workflow, et le publie par l'API.

## Décision

- Le socle calcule le diagnostic des blocages ; factory-live le lit par l'API et l'affiche.
- factory-live ne porte aucune règle de diagnostic et ne lit aucun format d'Hermès pour expliquer un blocage.
- Chaque phrase affichée reste un gabarit du catalogue `diagnosis.*` (français et anglais, ADR 0008), rempli des
  paramètres que le socle publie ; les citations restent des textes de leur source, tels quels.
- Aucun modèle d'IA, ni pour conclure ni pour rédiger : la règle de l'ADR 0009 reste.

## Écartés

- Garder les règles des deux côtés : deux copies qui divergent.
- Faire rédiger les phrases par le socle : les textes de l'interface restent dans les dictionnaires de factory-live
  (ADR 0008).

## Conséquences

- Un cas nouveau de diagnostic est une règle du socle ; ici, au plus un gabarit `diagnosis.*` en deux langues.
- Les règles de `packages/domain/src/diagnosis` et leurs lectures d'Hermès restent tant que l'interrupteur peut
  revenir sur Hermès (ADR 0015), puis partent avec l'ancienne lecture.
