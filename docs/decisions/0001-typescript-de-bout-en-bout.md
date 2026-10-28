# ADR 0001 : TypeScript de bout en bout

Date : 2026-10-28. Statut : accepté.

## Contexte

Clément veut une stack que la factory sache faire évoluer, qui reste ouverte à un plugin Hermès ou à une app native plus tard, et qui respecte TDD, clean architecture, logs et tests de bout en bout.

## Décision

- Monorepo npm workspaces : `packages/domain` (règles pures), `packages/contracts` (zod), `apps/server` (Hono sur Node 24 LTS), `apps/web` (React 19, Vite 8, Primer React, React Flow).
- TypeScript 6.0.3 strict. TypeScript 7.0.2 existe, mais typescript-eslint 8.72.1 exige `typescript <6.1.0`.
- Node 24.22.1 dans l'image ; la CI teste aussi Node 26, celui des agents de la factory.
- `node:sqlite` intégré (release candidate depuis Node 24.15, option `readOnly`) plutôt qu'un module natif.

## Pourquoi

Un seul langage et un seul outillage pour la factory, dont les gardes lancent déjà prettier, eslint et les tests JS. Les contrats zod servent au serveur et au front, et produisent l'OpenAPI qu'une app native consommera.

## Conséquences

- Un plugin du dashboard Hermès passerait par un `plugin_api.py` qui fait proxy vers l'API, et un bundle IIFE des vues avec le React de `window.__HERMES_PLUGIN_SDK__` (React 19 des deux côtés).
- Une app native passerait par un client Swift ou Kotlin généré depuis l'OpenAPI, et un adaptateur APNs ou FCM derrière le port `PushNotifier`.
