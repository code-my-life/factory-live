# ADR 0010 : la ligne d'usine en graphe

Date : 2026-11-03. Statut : accepté (Clément, maquette v5 validée le 2026-11-03, issue #18).

## Contexte

La ligne d'usine était une voie (`FlowLine`) de six stations, une boîte par issue (`JobBox`), et dessous l'activité en direct et ce que faisait chaque agent. Une issue avait sa page et son propre graphe de cartes, et une liste à part. Cette ligne ne ressemblait plus à la factory :

- la gate ne juge plus une PR de la même façon selon le type de l'issue (ADR 0017 de la factory) : fail-first, sabotages, invariance ou documents ;
- la livraison a ses étapes, chacune tenue par quelqu'un d'autre : ta revue, la fusion par GitHub, la CI de main, le déploiement ;
- une issue Diagnostic suit sa branche, et une issue revient en arrière (gate rouge, changements demandés, revert).

On ne voyait ni où était une issue, ni par où elle était passée. Une première maquette faite à la main a été refusée : des lignes partout, rien de relié, des informations répétées. La maquette v5, publiée en artifact, a été validée.

## Décision

- **Un seul graphe** (`apps/web/src/features/line/graph`), sur le modèle des « run graphs » : neuf stations (Intake, Brief, Implémentation, la gate et ses quatre preuves, Ta revue, Fusion, CI de main, Déploiement, Terminé), la branche Diagnostic, les retours, et le nœud des fournisseurs de modèles sous les stations dont l'agent appelle un modèle. Chaque station dit qui y travaille : IA, script, GitHub ou toi.
- **Une géométrie pure** (`layout.ts`) place les boîtes et trace les liens. Ses tests : deux ports par lien et aucun partagé, aucun croisement dans les éventails de la gate, aucune boîte sur une autre.
- **La station d'une issue se déduit des faits** (`lineStationOf`, domaine) :
  - les cartes du kanban jusqu'à la gate ;
  - puis la PR : ouverte, elle attend ta revue ;
  - fusionnée, elle passe par la CI de main au sha fusionné, puis par le déploiement (GitHub Deployments) ;
  - une main rouge la renvoie à ta revue (revert).
    Terminé garde sept jours.
- **Le trajet d'une issue** (`journeyOf`) se déduit des mêmes faits : runs, verdicts de la gate, revues, fusion, checks de main, déploiement. Ouverte, une issue montre son trajet sur les liens du graphe ; sous le graphe, seulement ses détails (runs, transcription, PR). `/issues/:dépôt/:numéro` ouvre la ligne sur l'issue ; la liste des issues et son entrée de navigation disparaissent.
- **Les liens** :
  - courbes, jamais d'angle droit ;
  - chacun son port rond aux deux bouts, dessiné au-dessus des boîtes ;
  - un lien sans activité pâlit sans disparaître, seul un lien en activité s'anime ;
  - le rouge est réservé aux problèmes ;
  - aucun texte sur un lien : une entrée de légende par sorte de lien, légende repliée à l'ouverture.
- **Les couleurs des branches** sont une palette catégorielle tirée de la palette « display » de Primer, vérifiée pour le daltonisme entre branches voisines (validateur de la skill dataviz). Elle tient dans une table (`palette.ts`), posée en style comme les teintes des badges : les règles de couleur de Primer pour les CSS ne connaissent que les rôles de l'interface.
- **Le mouvement** passe par Motion (`motion/react`) :
  - une carte voyage sur les liens jusqu'à sa nouvelle station, à vitesse constante : de 0,9 à 2,6 s selon la longueur du trajet ;
  - le trajet de l'issue ouverte court en comètes ;
  - un flux de points monte d'un fournisseur tant que son modèle répond.
    Les boucles portent `data-loop` et s'arrêtent avec le bouton de pause et `prefers-reduced-motion`. La ligne d'une issue paraît à l'arrivée de sa carte : aucune information ne tient au seul mouvement.
- **Le zoom** : la factory entière tient à l'écran à l'ouverture (échelle de 0,3 à 1,6). Deux doigts zooment sur un téléphone ; ailleurs, les boutons, ou Ctrl et la molette. Un doigt fait défiler la page et le graphe nativement.
- **Les cibles tactiles** :
  - à l'échelle la plus petite, deux issues qui se suivent dans une boîte restent à 24 px l'une de l'autre (WCAG 2.5.8) ;
  - d'où une ligne de 100 px, de 84 px dans Terminé (badge, titre, type, ancienneté), et de 56 px dans l'Intake, qui n'en montre qu'une ;
  - les contrôles du panneau font 44 px sur un écran tactile.

Écartés :

- Garder `FlowLine` : une voie unique ne montre ni les preuves de la gate, ni la branche Diagnostic, ni les retours.
- Une bibliothèque de graphes (React Flow et autres) : une dépendance de plus et son propre modèle d'interaction, pour un graphe fixe et petit.
- Les animations SMIL : elles tournent sur le fil principal et échappent au bouton de pause.
- Du texte sur les liens : illisible à l'échelle d'ensemble, remplacé par la légende.

## Conséquences

- La règle de mouvement d'AGENTS.md (500 ms au plus) garde une exception : ce qui court ou se dessine le long d'un lien. Une carte voyage selon la longueur de son trajet, un lien se dessine en 0,7 s. C'est un déplacement le long d'un chemin, pas une transition d'état, et l'information qu'il accompagne est déjà en place.
- Dans une ligne du graphe, l'état est l'icône d'état et la teinte de la ligne, pour tenir sur la ligne ; le `Label` d'état reste celui des détails de l'issue. Quand aucun texte visible ne dit l'état (ligne compacte, type à sa place), un texte caché le dit aux lecteurs d'écran.
- La station Déploiement lit les déploiements GitHub du sha fusionné : `factory-deploy.py` (dépôt de la factory) doit poster un déploiement et son état, avec la permission « Deployments » de l'App. Sans déploiement, une issue fusionnée à main verte passe à Terminé.
- Le serveur lit en plus les revues d'une PR, sa date et son commit de fusion, les checks de main sur ce commit et son déploiement.
- Les captures de référence, celles du site et du README montrent le graphe.
