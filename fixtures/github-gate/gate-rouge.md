### Gate de la factory : ❌ rouge (`140abfe`)

| Règle | | Détail |
|---|---|---|
| PR | ✅ | PR #16 ouverte par l'App, tête `140abfe` |
| Type | ✅ | type Interface : branche, titre et texte de PR conformes |
| Fraîcheur | ✅ | main `ddde829` incluse |
| Version | ✅ | version conforme au brief (minor) : apps/web/package.json, apps/server/package.json |
| Tests nommés | ✅ | 9 test(s) nommé(s) par l'issue présent(s) |
| CI | ✅ | 10 checks verts |
| Diff | ✅ | 17 fichiers, aucune règle du pre-commit enfreinte |
| Conventions | ✅ | conventions respectées sur les lignes modifiées |
| Fail-first | ✅ | « chaque lane porte un libellé distinct » rouge sur la base `ddde829`, vert sur la tête |
| Build hors ligne | ✅ | `npm run -s build` sans réseau, 4 s |
| Couverture du diff | ❌ | lignes modifiées jamais exécutées par un test : `apps/web/src/features/issues/TranscriptPanel.tsx` : 230 |

**À faire** : ajoute le test qui passe par ces lignes (ou retire-les), pousse, puis redemande la revue.

<details><summary>Extrait</summary>

```
$ npx vitest run --coverage --coverage.reporter=lcov --coverage.reporter=text-summary
code 0, 15 s, rapports : coverage/lcov.info
apps/web/src/features/issues/TranscriptPanel.tsx : 230
npm notice run factory-live@0.2.0 npx
npm notice run 'vitest' run --coverage --coverage.reporter=lcov --coverage.reporter=text-summary

 RUN  v5.0.5 /tmp/factory-gate/t_5b556209/tip
      Coverage enabled with v8


 Test Files  67 passed (67)
      Tests  637 passed (637)
   Start at  03:13:37
   Duration  14.46s (tests 32%, transform 28%, environment 21%, import 12%, setup 4%, worker 2%)

    Isolate  67 workers spawned · ~342ms startup each (spawn + environment, per file)
             at least ~1.19s faster with isolate: false : reuses workers across files instead of one per file

^[[34m % ^[[39m^[[2mCoverage report from ^[[22m^[[33mv8^[[39m

=============================== Coverage summary ===============================
Statements   : 85.42% ( 5742/6722 )
Branches     : 73.28% ( 4079/5566 )
Functions    : 87.88% ( 2103/2393 )
Lines        : 87.07% ( 5182/5951 )
================================================================================

```
</details>

La carte repart chez l'implémenteur. Preuves : `evidence/gate/140abfe` (carte `t_5b556209`).

<sub>Gate scriptée de la factory (ADR 0015) : règles écrites, aucun LLM. Mêmes entrées, même verdict.</sub>
