# ADR 0006 : dépendances

Date : 2026-10-28. Statut : accepté.

## Décision

- Versions exactes (`save-exact`), lockfile versionné, Dependabot hebdomadaire groupé, actions GitHub épinglées par SHA.
- Exclus : modules natifs, ORM, Redis ou file de messages, SaaS, CDN à l'exécution.
- `npm audit` signale `deepmerge` (GHSA-gcqx-w48m-w2h4, gravité faible, sans correctif), utilisé par Primer React pour fusionner ses thèmes. Aucune donnée externe n'arrive jusqu'à lui : accepté et surveillé.
- Playwright : Chromium en local ; WebKit (iPhone) demande des bibliothèques système, il tourne dans l'image Docker officielle de Playwright pour les tests de bout en bout.
