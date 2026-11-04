# Rapports JUnit

Vrais rapports produits dans ce dépôt, un test vert, un rouge et un ignoré chacun : `vitest.xml` (`vitest run --reporter=junit`) et `playwright.xml` (reporter `junit`, projets `demo-bureau` et `demo-iphone`). Anonymisés : le nom du poste devient `machine`, le dossier personnel `/home/user`, et le fichier de test temporaire `recette`.

`junit.zip` les range comme un artefact de la CI (`reports/junit/`), avec un fichier qui n'est pas un rapport. La recette des PR (#22) lit ces rapports pour juger chaque critère.
