# ADR 0002 : sources de données sans fichier écrit pour l'occasion

Date : 2026-10-28. Statut : accepté.

## Contexte

Première version du plan refusée : un plugin qui écrivait un journal JSONL et un `health.json` n'est pas viable à long terme (croissance, rotation, nettoyage, fichiers périmés, montages entre conteneurs).

## Décision

- Le direct passe par les webhooks sortants natifs d'Hermès (`hooks.outbound`, `agent/outbound_webhooks.py`) : POST JSON signé (HMAC) vers `http://127.0.0.1:8446/api/ingest/hermes`, file bornée et thread démon, jamais bloquant pour l'agent.
- Hooks retenus : `pre_tool_call`, `post_tool_call`, `post_api_request`, `api_request_error`, `on_skill_lifecycle`, `on_session_start`, `on_session_end`, `subagent_start`, `subagent_stop`, `kanban_task_claimed`, `kanban_task_completed`, `kanban_task_blocked`, `on_kanban_worker_spawned`, `on_kanban_worker_exited`, `on_kanban_worker_stale_claim`, `on_kanban_dispatch_tick`.
- Exclus : `pre_api_request`, `pre_llm_call` et `post_llm_call`, qui transportent toute la conversation à chaque appel (`agent/turn_api_request.py:63-85`).
- La santé active vient d'une petite sonde du gateway (`factory-live-probe`) qui envoie en HTTP, sans fichier.
- L'état durable et le rattrapage se lisent dans les bases natives d'Hermès (`kanban.db`, `state.db`), ouvertes en lecture seule, requêtes courtes, jamais de transaction longue.

## Pourquoi

Le sens WSL vers conteneur est déjà éprouvé (Hermès joint freellmapi sur 127.0.0.1:3001). Le sens inverse passe par Windows et casse après une veille.

## Conséquences

- factory-live arrêté : les envois échouent sans gêner la factory, avec un avertissement par envoi perdu dans le log du worker ; factory-live se recale sur les bases au redémarrage.
- Les dossiers des bases SQLite sont montés en lecture-écriture (SQLite y crée son `-shm`), les bases ouvertes en `readOnly`, et une règle de lint interdit toute écriture dans les adaptateurs Hermès.
