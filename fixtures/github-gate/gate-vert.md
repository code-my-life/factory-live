### Gate de la factory : ✅ vert (`5ba41e0`)

| Règle | | Détail |
|---|---|---|
| PR | ✅ | PR #16 ouverte par l'App, tête `5ba41e0` |
| Type | ✅ | type Interface : branche, titre et texte de PR conformes |
| Fraîcheur | ✅ | main `ddde829` incluse |
| Version | ✅ | version conforme au brief (minor) : apps/web/package.json, apps/server/package.json |
| Tests nommés | ✅ | 9 test(s) nommé(s) par l'issue présent(s) |
| CI | ✅ | 11 checks verts |
| Diff | ✅ | 18 fichiers, aucune règle du pre-commit enfreinte |
| Conventions | ✅ | conventions respectées sur les lignes modifiées |
| Fail-first | ✅ | « chaque lane porte un libellé distinct » rouge sur la base `ddde829`, vert sur la tête |
| Build hors ligne | ✅ | `npm run -s build` sans réseau, 5 s |
| Couverture du diff | ✅ | 110 ligne(s) exécutable(s) modifiée(s), toutes couvertes |
| Contrôles modifiés | ⚠️ | la PR modifie ses propres contrôles : .prettierignore, apps/server/package.json, apps/web/package.json, package.json |
| Interface | ⚠️ | 6 fichier(s) d'interface : aucune capture de référence modifiée par la PR |

La carte reste en revue : ton approbation fusionne, une demande de changements la renvoie au coder. Preuves : `evidence/gate/5ba41e0` (carte `t_5b556209`).

<sub>Gate scriptée de la factory (ADR 0015) : règles écrites, aucun LLM. Mêmes entrées, même verdict.</sub>
