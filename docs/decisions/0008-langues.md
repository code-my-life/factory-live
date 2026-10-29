# ADR 0008 : interface en français et en anglais

Date : 2026-10-29. Statut : accepté (Clément, 2026-10-29).

## Contexte

Toute l'interface était écrite en dur, en français, côté PWA comme côté serveur (fil d'activité, timeline, interventions, santé). Il faut l'anglais, au choix dans Réglages, sans dégrader le français, langue source.

## Décision

- **Dictionnaires typés maison et API Intl, sans dépendance.** `apps/web/src/i18n/fr.ts` donne la forme (`Messages`), `en.ts` doit la remplir : une clé absente ou un paramètre différent ne compile pas. Les pluriels passent par `Intl.PluralRules`, nombres, dates, durées et âges relatifs par `ui/format.ts` (`Intl.NumberFormat`, `Intl.DateTimeFormat`), langue par langue.
- Bibliothèques écartées, versions vérifiées le 2026-10-29 :
  - react-i18next 17.1.9 et i18next 26.5.11 : pairs compatibles (React >= 16.8, TypeScript ^5, ^6 ou ^7 optionnel), environ 20 ko compressés ; clés typées par augmentation de module, mais une langue incomplète ne casse pas la compilation sans artifice, et les paramètres sont typés à partir de chaînes d'interpolation.
  - Lingui 6.10.1 : macros par Babel ou par `@lingui/native-tools` (binaires Rust et SWC, dépendance du plugin Vite) : module natif exclu ; une traduction manquante se voit à l'extraction, pas au typage.
  - react-intl 12.1.6 : pairs compatibles (React >= 18), ICU, environ 15 ko compressés ; identifiants typés globalement, mais ni paramètres ni complétude d'une langue vérifiés.
- **Le serveur et le domaine n'écrivent plus de phrases pour la PWA.** Ce qu'ils fabriquent est un code et ses paramètres, catalogué dans les contrats (`Message`, union discriminée zod) ; un champ qui peut aussi porter un texte venu d'ailleurs est un `Text` (chaîne telle quelle, ou `Message`). Le domaine déclare ses propres types de messages (il ne dépend de rien) ; le serveur vérifie à la compilation qu'ils appartiennent au catalogue. Chaque dictionnaire du client a une section `server` qui couvre tout le catalogue (vérifié au typage et par un test qui rend chaque code avec des paramètres d'exemple).
- Langue par défaut : celle du navigateur, français s'il est en français, anglais sinon ; le choix de Réglages est gardé dans `localStorage` (`factory-live:locale`), posé sur `<html lang>`, et laissé au service worker dans le Cache Storage pour écrire les push dans cette langue.
- Les refus de l'API portent un code (`ApiError.code`) que la PWA écrit dans sa langue ; le texte `error` reste en français pour les journaux.
- Les pages que le serveur rend lui-même (création de l'App GitHub, connexion) suivent la langue passée par la PWA (`?lang=`), retenue dans un cookie pour le retour de GitHub, sinon `Accept-Language`.

## Conséquences

- Un texte s'ajoute en deux endroits (français puis anglais) ; un texte du serveur, en trois (le code au catalogue, puis les deux dictionnaires).
- Ce qui vient d'ailleurs n'est pas traduit : raisons et réponses des agents, noms d'outils et de modèles, détails de la sonde, titres d'issues et de cartes, transcriptions, scénario de démo. Les lignes d'activité enregistrées en français avant ce changement restent lisibles, telles quelles.
- Le service worker embarque les deux dictionnaires (environ 23 ko compressés).
