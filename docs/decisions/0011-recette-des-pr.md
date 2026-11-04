# ADR 0011 : la recette des PR, des preuves et pas de code

Date : 2026-11-04. Statut : accepté (Clément, maquette v2 validée dans la démo le 2026-11-04, issue #21).

## Contexte

Les PR de la factory sont écrites par des agents. Les relire sur GitHub, c'est lire du code que le propriétaire n'a pas écrit et ne veut plus lire : la relecture est devenue le goulot d'étranglement. La PR #19 (factory-live#18) en donne la mesure : 104 fichiers, +5 105 −2 086, 15 critères « prouvés » en prose, 10 fils de revue de Greptile, 17 revues postées. L'onglet « PR et CI » de la page d'issue montrait une liste de checks écrite en dur.

La recherche du 2026-11-04 a passé en revue T-Rex de Greptile (une VM qui clique sur la tête seule, sans comparer à la base), Factory.ai, Meticulous, Chromatic, Argos et Diffy. Aucun ne relie ce que l'issue demande à ce que la PR livre. Aucun ne propose non plus des jumeaux vivants, base et tête, sur lesquels les gestes du relecteur sont rejoués.

## Décision

- **Une recette par PR**, sous les faits de l'issue (`apps/web/src/features/acceptance`) : six widgets que le propriétaire ordonne, épingle, replie et dimensionne. Ce sont les critères d'acceptation, la CI et la gate, les tests unitaires et de bout en bout, les preuves, les retours de revue et les jumeaux interactifs. Aucune ligne de code n'y est montrée.
- **Le verdict par un picto seul**, nommé pour les lecteurs d'écran, une forme par sens : coche (OK), croix (NOK), horloge (en cours), œil (à voir), tiret (sans objet). Le propriétaire a refusé les pastilles OK/NOK.
- **Un élément NOK rend son widget rouge.** Un critère que la PR dit non prouvé est NOK, même avec une CI et une gate vertes. Ce que la PR déclare ne pas prouver est « à voir » : compté à part, montré en tête des preuves, sans rendre les preuves rouges.
- **L'en-tête compte les éléments, pas les widgets.** Chaque compte non nul mène au premier élément de son genre. Le bouton ne propose « Approuver sur GitHub » que si tout est OK.
- **Tout est visible, et tout tient sur une grosse PR** : les lignes vertes d'une longue liste se replient en une ligne (« 11 checks réussis »), et ce qui demande une décision reste en vue. Les preuves textuelles montrent leur texte : en entier jusqu'à 12 lignes, sinon le début et la fin. Les captures sont repliées par défaut, en vignettes.
- **Chaque élément mène à GitHub** : job, ligne du test, commentaire de la gate, discussion.
- **La disposition** (ordre, épinglés, repliés, demi-largeurs) est la même pour toutes les PR. Elle reste sur l'appareil dans cette version. Son enregistrement sur le serveur, par type d'écran, vient avec les données réelles (#22).
- **Le mouvement** passe par Motion, et rien ne dépend du glisser :
  - `Reorder`, pour le glisser par une poignée (un doigt ailleurs fait défiler la page) et pour les flèches quand la poignée a le focus ;
  - `layout="position"` pour les déplacements ;
  - un repli de la hauteur en 200 ms, où le contenu replié reste monté et `inert` ;
  - le menu de chaque widget (Monter, Descendre) remplace le glisser pour qui ne le peut pas (WCAG 2.5.7).
- **Les jumeaux** sont un aperçu sans flux dans cette version : surfaces de la PR, écrans avant/après, miroir, divergence. Les flux vivants viendront d'un banc de jumeaux de la factory : un conteneur Docker par commit, avec un écran X virtuel diffusé par Neko en WebRTC (hermes-software-factory#26). factory-live ne fera qu'afficher (#23) : le code d'une PR ne tourne jamais à côté de lui.
- **Aucun modèle** ne lit, ne juge ni ne rédige quoi que ce soit dans la recette, comme pour le diagnostic des blocages (ADR 0009).
- **La maquette est la démo** (`apps/web/src/demo/acceptance.ts`), pas un artifact : la vraie PR #19 avec ses données réelles, une PR rouge, une PR en cours, une maintenance.

Écartés :

- Garder l'onglet « PR et CI » : sa liste de checks était figée, et la recette dit tout ce qu'il disait.
- Des jumeaux en iframes de la même origine : limités au web et à une page simple. Le propriétaire veut une solution pour toute app, y compris les grosses features qui touchent l'interface, la logique, la doc et le site.
- Un résumé rédigé par un modèle (à la Greptile) : il peut inventer, et le propriétaire l'a refusé pour le diagnostic.
- Une bibliothèque de composants de plus : reactvibe.com et Motion avec Base UI n'ont servi que de références de design. Primer reste le seul système de composants (AGENTS.md).

## Conséquences

- Le contrat `AcceptanceView` (`packages/contracts/src/acceptance.ts`) est optionnel dans `IssueDetail` : en live, rien ne s'affiche tant que le serveur ne le calcule pas (#22).
- La démo sert des images de captures et des écrans de jumeaux (`apps/web/public/demo/`). Le service worker de l'app installée ne les met pas en cache.
- La capture de référence `recette` (`e2e/captures.spec.ts`) montre la recette de la PR #19.
