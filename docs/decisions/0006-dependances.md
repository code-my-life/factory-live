# ADR 0006 : dépendances

Date : 2026-10-28. Statut : accepté.

## Décision

- Versions exactes (`save-exact`), lockfile versionné, Dependabot hebdomadaire groupé, actions GitHub épinglées par SHA.
- Exclus : modules natifs, ORM, Redis ou file de messages, SaaS, CDN à l'exécution.
- `npm audit` signale `deepmerge` (GHSA-gcqx-w48m-w2h4, gravité faible, sans correctif), utilisé par Primer React pour fusionner ses thèmes. Aucune donnée externe n'arrive jusqu'à lui : accepté et surveillé.
- `simple-icons` (16.35.0, CC0, sans dépendance ni script d'installation) : logos des éditeurs de modèles et des fournisseurs dans les badges. Import nommé des seules icônes affichées (`ui/badge/marks.ts`) : le reste du paquet ne passe pas dans le bundle (+8,5 Ko gzip pour onze logos et le code des badges).
- Playwright : Chromium en local ; WebKit (iPhone) demande des bibliothèques système, il tourne dans l'image Docker officielle de Playwright pour les tests de bout en bout.
