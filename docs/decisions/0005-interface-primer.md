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

## Révision du 2026-10-29 : badges (validée par Clément sur la démo)

- Un fait clé | valeur s'affiche en badge (`ui/badge`) : l'étiquette grise à gauche (la clé : fournisseur, dépôt, type de carte, « CI »), la valeur à droite (la donnée, en police de code pour un identifiant), teintée de la couleur de l'état. C'est le modèle du style « flat » de shields.io (liste awesome-badges), rendu en HTML avec les jetons Primer plutôt qu'en image : aucune ressource externe (l'app vit sur un tailnet, hors ligne), les deux thèmes, du vrai texte lu par les lecteurs d'écran. La teinte reste « muted » et le texte garde sa couleur par défaut : les aplats saturés de shields (blanc sur vert) ne passent pas le contraste.
- Un concept, un badge, partout : modèle (`ModelBadge`, fournisseur | nom, « lane » pour le CLI délégué), issue (`IssueBadge`, dépôt | numéro), carte (`CardBadge`, type | identifiant), CI (`ChecksBadge`), version (`VersionBadge`). Les composants Primer gardent leur rôle : `Label` pour l'état d'une issue ou d'une carte (`WorkStateLabel`, les mêmes couleurs sur toutes les pages), `StateLabel` pour l'état d'une PR, `CounterLabel` pour un compte, `Token` pour une skill.
- Pas de badge pour les nombres (jetons, coût, durée) : chiffres tabulaires dans les tableaux et les chiffres clés, alignés pour se comparer.
- Valeur trop longue : tronquée sur une ligne (par défaut), entière sur plusieurs lignes sur un écran de détail (Agents), deux lignes au plus dans un tableau ; le nom entier reste dans l'infobulle et pour les lecteurs d'écran.

## Révision du 2026-10-29, après le retour de Clément : icônes et couleurs (validée sur la démo v9)

- Retour sur la maquette des badges : allure générale validée ; il manque des couleurs, des icônes, et des modèles s'affichent encore sans badge.
- Icônes en SVG inline, rien du réseau : une octicon pour un concept (issue à la couleur de son état GitHub, type de carte comme sur le graphe, version, état) ; un logo de Simple Icons (CC0, le jeu d'icônes de shields.io et de badgen) pour l'éditeur d'un modèle (Claude, NVIDIA, Google, Gemini, Qwen, Mistral AI, Meta, DeepSeek, Moonshot AI) et pour les fournisseurs de marque (API NVIDIA, Claude Code, OpenCode) et la CI (GitHub Actions). Un fournisseur sans logo prend une octicon : serveur (freellmapi), processeur (llama.cpp local), pile (MoA). Pas de logo OpenAI (gpt-oss) : Simple Icons ne l'a plus ; un modèle inconnu reste sans logo plutôt que d'en recevoir un faux.
- Couleurs : l'étiquette d'un fournisseur de marque prend la couleur de la marque, texte blanc ou noir selon le plus contrasté, comme shields.io (4,5:1 au moins) ; le logo d'un éditeur garde sa couleur là où il garde 3:1 sur le fond du badge, sinon la couleur du texte (`light-dark()` suit le thème). Ces couleurs de marque sont des données de Simple Icons posées en style inline : la seule exception aux jetons Primer. Les états prennent les aplats « emphasis » de Primer, texte blanc : CI, état d'une issue ou d'une carte (`WorkStateLabel`), résultat d'une issue terminée ; la PR l'avait déjà (`StateLabel`).
- Contrastes vérifiés dans les deux thèmes par les tests unitaires (valeurs des jetons lues dans `@primer/primitives`, couleurs des marques) et par les tests de bout en bout (couleurs calculées par le navigateur).
- Un seul code couleur par badge : la valeur d'un modèle reste neutre. Une lane a l'étiquette aux couleurs de son outil (Claude Code, OpenCode), sans la teinte violette d'avant ; un modèle observé en direct n'a plus de teinte bleue : « observé sur le dernier appel » se lit dans l'infobulle et le texte des lecteurs d'écran, dans les deux langues.
- Page Santé : chaque tuile porte l'icône de son service, la même que dans les badges (GitHub pour son API et ses webhooks, Tailscale pour le Funnel, NVIDIA, Claude), une octicon pour les autres (llama.cpp : processeur, freellmapi : serveur, gateway, dispatcher, pause, dashboard, disque, MCP, cron, sonde, sources). Aucun logo inventé : pas de Docker, faute de service Docker suivi ; un service inconnu prend le serveur.
- Usage référentiel des marques accepté par Clément pour cet outil personnel sur un tailnet ; à revoir si l'app devenait publique (lignes directrices de Google, Meta et GitHub, citées par Simple Icons).
