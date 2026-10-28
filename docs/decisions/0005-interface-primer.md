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
- Ce graphe a deux formes (`FlowView`, retour de Clément sur la maquette v3 : sur iPhone, la zone du graphe bloquait le défilement, rien ne s'y touchait et rien ne s'y lisait) :
  - en largeur quand il tient à un zoom lisible (80 % au moins) : React Flow statique, son fond laisse passer le défilement (React Flow y pose `touch-action: none`, rétabli en `pan-x pan-y pinch-zoom`) et le contenu des nœuds reste cliquable (React Flow rend transparent au pointeur un nœud sans action propre) ;
  - sinon, téléphone ou fenêtre étroite : la voie verticale (`FlowRail`), mêmes arrêts et mêmes liaisons dans le flux de la page, sans aucun geste capturé. Chaque station y donne ses agents au travail et ses issues avec leur titre, chaque issue est une ligne à toucher ; chaque carte d'une issue se choisit d'un toucher sur toute sa ligne et ses runs viennent à l'écran.
- Pas de « More » en anglais : Primer l'écrit en dur dans `UnderlineNav` ; les onglets d'une issue défilent de côté sur téléphone.
- Une seule timeline, le composant `Timeline` de Primer, pour le fil en direct comme pour l'historique d'une issue.
- Chaque agent a son avatar : identicon à la manière de GitHub (motif 5 × 5 symétrique, couleur propre tirée de la palette de visualisation de Primer), affiché par `Avatar` en carré, la forme que Primer réserve aux bots et aux apps.
- Les tableaux passent par le composant `Table` de Primer.
- Bouton de pause des animations en boucle : Primer interdit tout mouvement en boucle sans contrôle de l'utilisateur.
