# factory-live

La factory Hermès en temps réel : quelle issue est à quelle étape, quel profil y travaille, avec quel modèle, ce qu'il fait à la seconde près, et ce qui attend ta décision.

- **Ligne d'usine** : Intake, Brief, Implémentation, Gate, Release, Terminé ; les issues avancent d'une station à l'autre.
- **Issue** : graphe des cartes, timeline, runs, transcription intégrale (session Hermès, lane Claude Code ou OpenCode, terminal brut), PR et CI, coûts.
- **Interventions** : la question entière de l'agent et le déblocage depuis l'app (commentaire `/factory unblock` sur l'issue), push sur l'iPhone pour les blocages qui t'attendent.
- **Agents, Santé, Coûts et quotas, Historique** : chaîne de modèles et dérive de configuration, services de la factory, jetons et 429, délais et taux de passage en gate.

## Démarrer

```bash
npm ci
npm run dev:web        # front sur les données de démonstration, http://127.0.0.1:5173
npm run verify         # format, lint, types, texte, architecture, tests, build
docker compose -f docker/compose.yaml up -d --build   # le service, http://localhost:8446
```

Ouvrir : `http://localhost:8446` sur ce PC, l'adresse tailnet (`https://<machine>.<tailnet>.ts.net:8446`, réglée dans `docker/.env`) depuis l'iPhone ou le Mac (tailnet seulement).

## Où regarder

- [AGENTS.md](AGENTS.md) : règles et commandes du dépôt.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) : sources de données, couches, flux.
- [docs/RUNBOOK.md](docs/RUNBOOK.md) : exploitation du service, secrets, Tailscale, pannes.
- [docs/decisions/](docs/decisions/) : décisions d'architecture.
