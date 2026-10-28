# ADR 0005 : interface Primer, validée sur maquette

Date : 2026-10-28. Statut : accepté.

## Décision

- Primer React 38 (design system de GitHub), thème sombre par défaut, bascule clair ou système. Pas liquid-paper : outil technique qui affiche code, terminal et logs.
- Le MCP utile est `@primer/mcp` (Primer React), pas `@primer/brand-mcp` (Primer Brand, sites marketing).
- Aucun écran n'est développé au-delà de la maquette avant la validation de Clément. La maquette est la vraie app sur le scénario de démo, publiée en artifact.
- Garde-fous tirés des bugs de claude-cockpit (#88, #52, #12, #8) : aucun flou ni transparence, composants Primer, troncatures et coupures explicites, captures de référence au pire cas et détecteur de débordement en e2e.

## Graphiques

Graphiques maison en HTML et CSS (une série, marques fines, valeur au bout ou au sommet, tableau à un clic) plutôt que recharts, retiré : moins de dépendances pour deux graphiques.

## Révision du 2026-10-28, après les retours de Clément sur la maquette

- Le MCP Primer (`@primer/mcp`) n'avait pas été chargé (session lancée hors du dépôt) : il est désormais interrogé (composants, jetons, règles de mouvement) et ses règles sont appliquées en CI par `eslint-plugin-primer-react` et `@primer/stylelint-config`. Les jetons de mouvement (`functional/motion/motion.css`) n'étaient pas importés : ils le sont.
- Un seul dessin pour la ligne d'usine et pour une issue, `FlowLine` (`ui/flow`), à la manière du graphe d'un workflow GitHub Actions (retours de Clément sur les maquettes v3 à v5 : sur la ligne, des issues listées sous une station semblaient n'en faire qu'une, et on ne voyait ni qui travaillait ni qui était bloqué) :
  - des arrêts reliés par une voie (une station, ou un rang de cartes d'une issue), et sous chaque arrêt ses jobs, une boîte chacun (`JobBox`, `ui/work`) : l'icône d'état (le `Spinner` de Primer quand un agent y travaille), le badge de l'objet (`Token` : numéro d'issue, type de carte), depuis quand, le titre, l'état nommé par un `Label` (« En cours », « Attend ta décision », « Bloquée », « En file »), l'agent qui le tient, puis ce qu'il fait ou ce qu'on attend de toi, avec l'action (répondre, approuver la PR) ;
  - le cadre d'une boîte qui t'attend ou qui bloque prend la couleur de l'état ; les stations de bord (intake, terminé) résument leurs issues ;
  - en largeur quand les colonnes tiennent, sinon en hauteur (téléphone, iPad en portrait), avec les jobs côte à côte quand l'étape a la place (requête de conteneur) ; aucun geste n'est capturé, la page défile et chaque boîte se touche entière ;
  - le flux parcourt la voie vers une station au travail ; quand une issue change de station, sa boîte glisse vers sa nouvelle colonne (Motion, `layoutId`, 500 ms, `--motion-easing-move`), sans glisser si les animations sont en pause ou réduites. L'anneau qui respirait sur l'arrêt est retiré : le travail en cours se lit sur la boîte.
- React Flow et dagre sont retirés : le graphe n'est plus un canevas (ni zoom ni glisser, qui gênaient le doigt), c'est une grille CSS et des listes, accessibles et plus légères.
- Pas de « More » en anglais : Primer l'écrit en dur dans `UnderlineNav` ; les onglets d'une issue défilent de côté sur téléphone.
- Une seule timeline, le composant `Timeline` de Primer, pour le fil en direct comme pour l'historique d'une issue.
- Chaque agent a son avatar : identicon à la manière de GitHub (motif 5 × 5 symétrique, couleur propre tirée de la palette de visualisation de Primer), affiché par `Avatar` en carré, la forme que Primer réserve aux bots et aux apps.
- Les tableaux passent par le composant `Table` de Primer.
- Bouton de pause des animations en boucle : Primer interdit tout mouvement en boucle sans contrôle de l'utilisateur.
