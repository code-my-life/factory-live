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
- Un seul dessin de graphe pour la ligne d'usine et pour une issue : des stations rondes (couleur de l'état, anneau qui respire quand on y travaille) reliées par une voie que parcourt un flux ; une issue qui change de station glisse sur la voie (500 ms, `--motion-duration-long`). Plus de cases de kanban.
- Une seule timeline, le composant `Timeline` de Primer, pour le fil en direct comme pour l'historique d'une issue.
- Chaque agent a son avatar : identicon à la manière de GitHub (motif 5 × 5 symétrique, couleur propre tirée de la palette de visualisation de Primer), affiché par `Avatar` en carré, la forme que Primer réserve aux bots et aux apps.
- Les tableaux passent par le composant `Table` de Primer.
- Bouton de pause des animations en boucle : Primer interdit tout mouvement en boucle sans contrôle de l'utilisateur.
