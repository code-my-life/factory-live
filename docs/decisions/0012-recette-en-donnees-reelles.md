# ADR 0012 : la recette des PR en données réelles

Date : 2026-11-04. Statut : accepté (issue #22, décisions du propriétaire du 2026-11-04 : rapports JUnit publiés par la CI, preuves textuelles tirées des fichiers de la gate, disposition gardée sur le serveur par type d'écran).

## Contexte

La recette (ADR 0011, #21) ne vivait que sur la démo. En direct, le serveur ne remplissait pas le champ `acceptance` du détail d'une issue. Il lisait sur GitHub l'état de la PR et un résumé de sa CI, mais ni les critères, ni les checks un par un, ni la gate, ni les tests, ni les fils de revue. La CI ne publiait aucun rapport de tests quand elle était verte.

## Décision

- **Le cache GitHub lit la recette de chaque PR** au rythme des autres lectures (30 s pour une issue active). Il lit :
  - les textes de l'issue et de la PR ;
  - les check runs et les statuts de la tête, avec le dernier run de chaque nom ;
  - le dernier commentaire de la gate ;
  - les rapports JUnit des artefacts `junit…` de la dernière exécution de chaque workflow de la tête (une relance remplace l'ancienne), lus une fois par artefact (un artefact ne change jamais) ;
  - les PNG que la PR modifie ;
  - les fils de revue, par GraphQL et avec le jeton de lecture de l'App.

  Chaque partie passe par `optional()` : un refus la laisse sans données, le reste vient (ADR 0010).

- **Un critère est jugé par une règle écrite**, sans modèle (ADR 0009). Ses tests sont ceux que sa ligne `- Cn : …` de la section « Critères » de la PR nomme entre « ».
  - OK : chacun de ses tests est vert dans les rapports de la tête, sur chaque projet.
  - NOK « sa preuve échoue » : l'un d'eux est rouge.
  - NOK « non prouvé » : la PR le dit, ne nomme aucun test, ou nomme un test absent des rapports une fois la CI finie (un test sauté ne prouve rien).
  - En cours : un de ses tests manque tant qu'un check de la tête tourne.
- **La gate se lit dans son format exact** (`scripts/factory-gate.py` de la factory) : le titre avec le verdict et la tête, puis le tableau « Règle | | Détail » (✅ ok, ❌ NOK, ⚠️ et ➖ info). Hors factory, la gate ne poste qu'un statut : sa description devient la seule règle. Un commentaire de la même forme écrit par une personne ne compte pas.
- **Les preuves textuelles** sont les fichiers `evidence/gate/<sha7>/NN-<règle>.txt` des cartes de l'issue, lus par la liste blanche (`HermesPaths.gateProofs`). Au-delà de 64 Ko, on en garde le début et la fin ; les jetons y sont masqués comme dans les journaux.
- **Les captures** sont les PNG que la PR modifie. Le serveur les lit sur GitHub et les sert à `/api/acceptance/:repo/:pr/capture?path=…&side=base|head`. Il n'y a aucun jeton dans l'adresse, et tout autre fichier du dépôt est refusé.
- **Ce que la PR déclare ne pas prouver** : un point par élément de sa section « Ce qui n'est pas prouvé ».
- **La CI publie ses rapports JUnit à chaque exécution**, verte comprise :
  - `junit-unit` : Vitest, sous Node 24.22.1 ;
  - `junit-e2e` : le reporter `junit` de Playwright en CI.

  Les deux sont gardés 30 jours.

- **La disposition** se garde dans la base de factory-live, une par type d'écran : téléphone sous 768 px, sinon bureau.
  - Elle est lue et écrite par `GET` et `PUT /api/preferences/acceptance-layout?device=phone|desktop`.
  - Seuls ce PC et un login Tailscale autorisé l'écrivent : c'est la garde du déblocage.
  - La PWA la lit au chargement et l'envoie une fois le changement posé (un glisser réordonne à chaque pas). L'appareil en garde une copie par type d'écran pour le hors-ligne ; franchir le seuil du téléphone recharge la disposition de l'autre type, sans y reporter un changement en cours.
- **Aucune dépendance nouvelle** : le zip d'un artefact se lit par son répertoire central et `zlib`, avec un budget (50 rapports et 50 Mo par archive), un rapport JUnit par un petit lecteur fait pour Vitest et Playwright. Les listes de GitHub (commentaires, fichiers, check runs, fils de revue) se lisent page après page.
- **Les jumeaux** restent absents (`twinsAbsent: 'no_build'`) tant que le banc de la factory n'existe pas (hermes-software-factory#26).

Écartés :

- Lire la CI par le seul résumé des workflows : il ne dit ni quel test prouve quel critère, ni lequel échoue.
- Une bibliothèque de zip ou de XML : deux formats connus, quelques dizaines de lignes testées sur de vrais rapports.
- Le compte des tests sautés comme preuve, ou une preuve sans test nommé : la recette ne prend pour vrai que ce que la CI a vérifié.

## Conséquences

- Les lecteurs sont testés sur de vraies réponses anonymisées (`fixtures/github-gate`, `fixtures/github-junit`, `fixtures/github-acceptance`).
- Un changement du format du commentaire de la gate, ou du nom des artefacts `junit…`, se fait des deux côtés : factory et factory-live.
- Une PR de la factory est OK critère par critère seulement si sa section « Critères » nomme ses tests : c'est déjà le standard des PR (ADR 0017 de la factory).
