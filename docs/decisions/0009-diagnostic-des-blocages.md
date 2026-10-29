# ADR 0009 : diagnostic des blocages, des règles et pas de LLM

Date : 2026-10-29. Statut : accepté (Clément, 2026-10-29).

## Contexte

NOK du 2026-10-29 sur la recette factory-live#2. La carte t_665ba7d7 (coder) s'est bloquée en `capability` avec une raison écrite par l'agent. L'intervention ne disait ni la cause, ni qui devait agir, ni si « Débloquer » suffisait. Il a fallu croiser à la main les résultats d'outils, le journal d'Hermès, la config de l'agent, le code de coder-guard et l'historique des runs : coder-guard lançait ses contrôles dans son hook `pre_tool_call`, Hermès coupait ce hook à 30 s puis refusait tous les outils de l'agent. Débloquée avant la correction, la carte serait retombée dans le même échec, et le 2e blocage du même type l'envoie en triage.

factory-live avait déjà une partie des preuves (refus reçus par webhook, résultats d'outils dans `state.db`, plugins actifs) sans les relier. Clément refuse qu'un modèle rédige ou réécrive ces explications.

## Décision

- **Des règles pures du domaine** (`packages/domain/src/diagnosis`) sur des faits lus dans les sources d'Hermès. Les formats exacts qu'Hermès écrit (résultats d'outils, erreurs des runs, lignes du journal, v0.22.2) sont réunis dans `hermesText.ts` ; les règles ne lisent qu'eux, jamais le texte libre de l'agent. Chaque constat dit sa cause (`FindingCode`), qui agit (toi côté factory, toi par une réponse, l'agent, personne), l'état de la cause (présente, corrigée, vérifiée, durable), ses preuves, les étapes et leurs commandes exactes.
- **Aucune phrase écrite par un modèle.** Chaque texte est un gabarit du catalogue (`diagnosis.*`, français et anglais, ADR 0008) rempli de paramètres. Les citations sont des textes d'Hermès ou de l'agent tels quels, secrets masqués, coupés à 300 caractères, étiquetés de leur source. La raison de l'agent reste affichée à part, telle quelle.
- **Prudence.** Chaque constat est « certain » ou « probable » ; à défaut de règle, « inexpliqué », avec les derniers refus et erreurs bruts. Un verdict par run, pas un verdict global. L'épisode examiné va du dernier changement de main (création, déblocage, blocage, revue, réassignation) jusqu'à l'événement raconté ; une cause qui en explique une autre la masque, le choix de la cause principale est déterministe et ne dépend pas de l'ordre des faits.
- **Les sources, par ordre de confiance.** `state.db` fait foi pour les résultats d'outils, par égalité exacte du texte (un `LIKE` prendrait le `kanban_show` d'une carte bloquée, qui cite le refus). Le journal d'Hermès (`logs/agent.log`) confirme et précise : quel hook, quel module, à quelle heure (`HERMES_TZ`). Les webhooks ne servent qu'au direct : ils perdent des événements et n'ont que la première ligne. S'y ajoutent la config de l'agent et celle du dépôt, le code des plugins actifs (`register_hook`) et les preuves du worktree.
- **Lecture en liste blanche** (`adapters/hermes/paths.ts`) : config, journal, code des plugins actifs, dossier de preuves, rien d'autre d'un profil ; ni lien symbolique, ni sortie de racine, tailles plafonnées. La session d'un run n'est jamais devinée : notée par Hermès, sinon `hermes --resume`, sinon la seule session lancée avec le run dont le premier message est « work kanban task <carte> ».
- **Hors ligne.** Le chemin du diagnostic n'importe aucun module réseau (règle `diagnosis-is-offline` de dependency-cruiser) et un test vérifie qu'aucun `fetch` ne part pendant un calcul.
- **Hors de la projection.** `DiagnosisService` calcule après chaque lecture du kanban, au tick et toutes les 2 s sur les seules empreintes des fichiers (dates de modification) ; la projection du tableau ne lit que son cache. Un diagnostic qui ne change qu'à l'heure de calcul près n'est pas renvoyé aux clients.
- **Un garde-fou.** Tant que la cause est présente côté factory, le serveur refuse le déblocage (409 `cause_present`) sauf `acknowledgeCause` ; l'audit garde l'état de la cause. Une intervention débloquée reste visible 30 min avec le run suivant et s'il rebloque pour la même cause.

Écartés :

- Un modèle qui lit les sources et résume : non déterministe, capable d'inventer une cause, coûteux et lent, et refusé par Clément.
- Les webhooks seuls : incomplets (événements perdus, première ligne seulement).
- Un diagnostic calculé dans la projection du tableau : des lectures de fichiers dans le flux SSE.

## Conséquences

- Un cas nouveau, c'est une règle, un gabarit en deux langues et une fixture tirée d'un vrai incident, anonymisée (RUNBOOK, « Diagnostic des blocages »). Les 13 incidents réels du kanban (`incidents.test-helpers.ts`) servent de non-régression.
- Une mise à jour d'Hermès qui change un de ses textes casse les règles concernées : les formats sont tous dans `hermesText.ts`, les fixtures le montrent.
- Le conteneur lit le journal des agents et le code de leurs plugins par le montage `profiles` existant, en liste blanche ; aucun fichier n'est écrit dans `~/.hermes`.
- Le journal d'Hermès note l'heure locale sans fuseau : `HERMES_TZ` (Europe/Paris par défaut) doit suivre le fuseau de ce PC.
