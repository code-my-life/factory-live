# ADR 0005 : interface Primer, validée sur maquette

Date : 2026-10-28. Statut : accepté.

## Décision

- Primer React 38 (design system de GitHub), thème sombre par défaut, bascule clair ou système. Pas liquid-paper : outil technique qui affiche code, terminal et logs.
- Le MCP utile est `@primer/mcp` (Primer React), pas `@primer/brand-mcp` (Primer Brand, sites marketing).
- Aucun écran n'est développé au-delà de la maquette avant la validation de Clément. La maquette est la vraie app sur le scénario de démo, publiée en artifact.
- Garde-fous tirés des bugs de claude-cockpit (#88, #52, #12, #8) : aucun flou ni transparence, composants Primer, troncatures et coupures explicites, captures de référence au pire cas et détecteur de débordement en e2e.

## Graphiques

Graphiques maison en HTML et CSS (une série, marques fines, valeur au bout ou au sommet, tableau à un clic) plutôt que recharts, retiré : moins de dépendances pour deux graphiques.
