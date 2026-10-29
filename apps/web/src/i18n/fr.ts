import type {
  AgentState,
  ApiErrorCode,
  BlockKind,
  CardKind,
  ChecksState,
  ConfigField,
  HealthStatus,
  InterventionKind,
  IssueStatus,
  KanbanStatus,
  LimitKey,
  MessageCode,
  MessageParams,
  ModelRef,
  RunRole,
  ServiceHealth,
  StationId,
} from '@factory-live/contracts';
import { formatters } from '../ui/format.ts';

/** Chaque texte fabriqué par le serveur (catalogue `Message` des contrats), écrit avec ses paramètres. */
export type ServerMessages = { [C in MessageCode]: (params: MessageParams<C>) => string };

/**
 * Le dictionnaire français, langue source de l'interface : sa forme fait le type `Messages`, que le
 * dictionnaire anglais doit remplir entièrement (une clé absente ou un paramètre différent ne compile pas).
 * Ajouter un texte : l'écrire ici, puis son équivalent dans `en.ts` ; l'écran le lit par `useI18n().t`.
 */
const f = formatters('fr');

/** Le vocabulaire de la factory, tel qu'il apparaît dans ses docs et sur les issues. */
const station = {
  intake: 'Intake',
  brief: 'Brief',
  implementation: 'Implémentation',
  gate: 'Gate',
  release: 'Release',
  done: 'Terminé',
  stopped: 'Arrêté',
  side: 'Voie annexe',
} satisfies Record<StationId, string>;

const intervention = {
  needs_input: 'Décision attendue',
  capability: 'Outil ou accès manquant',
  transient: 'Échec passager',
  gave_up: 'Abandon',
  triage_loop: 'Boucle de blocage',
  held_active_pr: 'Carte retenue',
  pr_approval: 'PR à approuver',
  main_red: 'Main rouge',
  service_down: 'Service en panne',
} satisfies Record<InterventionKind, string>;

const cardStatus = {
  triage: 'Triage',
  todo: 'En attente',
  scheduled: 'Planifiée',
  ready: 'Prête',
  running: 'En cours',
  blocked: 'Bloquée',
  review: 'En revue',
  done: 'Terminée',
  archived: 'Archivée',
} satisfies Record<KanbanStatus, string>;

const blockKind = {
  needs_input: 'décision attendue',
  capability: 'outil ou accès manquant',
  transient: 'échec passager',
  dependency: 'dépendance',
} satisfies Record<BlockKind, string>;

const SKILL_ACTIONS: Readonly<Record<string, string>> = {
  loaded: 'Skill chargée',
  created: 'Skill créée',
  edited: 'Skill modifiée',
  patched: 'Skill modifiée',
  installed: 'Skill installée',
};

const attempt = (current: number | null, total: number | null) =>
  current !== null && total !== null ? ` (essai ${current} sur ${total})` : '';

const statusLabel = (status: string) =>
  (cardStatus as Readonly<Record<string, string>>)[status] ?? status;

/** Les issues d'un run (`task_runs.outcome`) telles qu'Hermès les écrit ; une inconnue reste brute. */
const runOutcome: Readonly<Record<string, string>> = {
  completed: 'terminé',
  review_requested: 'revue demandée',
  changes_requested: 'changements demandés',
  blocked: 'bloqué',
  crashed: 'planté',
  gave_up: 'abandonné',
  timed_out: 'délai dépassé',
  rate_limited: 'limite du fournisseur',
  reclaimed: 'repris',
  spawn_failed: 'lancement en échec',
  scheduled: 'planifié',
  discarded: 'écarté',
};

const outcomeLabel = (outcome: string) => runOutcome[outcome] ?? outcome;

/** Un délai en secondes, écrit comme les autres durées : « 30 s », « 10 min », « 7 min ». */
const secs = (seconds: number) => f.duration(seconds * 1000);

/** Ce que le serveur et le domaine fabriquent : fil d'activité, timeline, interventions, santé... */
const server: ServerMessages = {
  'activity.tool.unknown': () => 'outil',
  'activity.action.llm': () => 'Appel au modèle',
  'activity.llm.tokens': ({ input, output }) =>
    `${f.integer(input)} jetons en entrée, ${f.integer(output)} en sortie`,
  'activity.llm.rateLimited': ({ model, attempt: current, attempts }) =>
    `429 sur ${model}${attempt(current, attempts)}`,
  'activity.llm.error': ({ status, model, attempt: current, attempts }) =>
    `Erreur${status ? ` ${status}` : ''} sur ${model}${attempt(current, attempts)}`,
  'activity.skill': ({ action }) => SKILL_ACTIONS[action] ?? `Skill : ${action}`,
  'activity.session.end': ({ outcome }) =>
    outcome === 'failed'
      ? 'Session en échec'
      : outcome === 'interrupted'
        ? 'Session interrompue'
        : 'Session terminée',
  'activity.kanban.claimed': ({ profile }) => `Le dispatcher lance ${profile}`,
  'activity.worker.spawned': () => 'Worker lancé',
  'activity.worker.exited': () => 'Worker arrêté',
  'activity.worker.stale': () => 'Carte reprise au worker muet',
  'activity.subagent.start': () => 'Sous-agent lancé',
  'activity.subagent.stop': () => 'Sous-agent terminé',

  'timeline.created': () => 'Carte créée',
  'timeline.created.for': ({ assignee }) => `pour ${assignee}`,
  'timeline.claimed': () => 'Carte prise',
  'timeline.promoted': () => 'Carte prête',
  'timeline.promoted.detail': () => 'ses dépendances sont terminées',
  'timeline.status': ({ status }) => `Statut : ${statusLabel(status)}`,
  'timeline.assigned': ({ assignee }) => `Réassignée à ${assignee ?? '?'}`,
  'timeline.assigned.from': ({ from }) => `avant : ${from}`,
  'timeline.edited': () => 'Carte modifiée',
  'timeline.attached': () => 'Pièce jointe',
  'timeline.scheduled': () => 'Carte planifiée',
  'timeline.reviewRequested': ({ reviewer }) => `Revue demandée à ${reviewer ?? 'la gate'}`,
  'timeline.reviewReopened': () => 'Revue rouverte',
  'timeline.changesRequested': ({ reviewer }) =>
    `Changements demandés par ${reviewer ?? 'la gate'}`,
  'timeline.prChecks.passed': () => 'Contrôles de la PR au vert',
  'timeline.prChecks.failed': () => 'Contrôles de la PR en échec',
  'timeline.completed': () => 'Carte terminée',
  'timeline.archived': () => 'Carte archivée',
  'timeline.blocked': ({ kind }) => (kind ? `Carte bloquée : ${blockKind[kind]}` : 'Carte bloquée'),
  'timeline.unblocked': () => 'Carte débloquée',
  'timeline.blockLoop': () => 'Boucle de blocage : carte passée en triage',
  'timeline.respawnGuarded': () => 'Relance retenue',
  'timeline.respawnGuarded.activePr': () =>
    'Une PR citée il y a moins de 24 h attend un relais (garde active_pr)',
  'timeline.dependencyWait': () => 'En attente de la carte parente',
  'timeline.reclaimed': () => 'Carte reprise au worker',
  'timeline.reclaimed.manual': () => 'à la main',
  'timeline.crashed': () => 'Worker planté',
  'timeline.timedOut': () => 'Délai du worker dépassé',
  'timeline.rateLimited': () => 'Worker arrêté par une limite du fournisseur',
  'timeline.protocolViolation': () => 'Worker sorti sans terminer ni bloquer la carte',
  'timeline.spawnFailed': () => 'Lancement du worker en échec',
  'timeline.gaveUp': ({ failures }) =>
    failures === null
      ? 'Abandon après plusieurs échecs'
      : `Abandon après ${failures} ${f.plural(failures, 'échec', 'échecs')}`,
  'timeline.workerReaped': () => 'Worker résiduel arrêté',
  'timeline.modelOverride': ({ model }) => `Modèle forcé : ${model ?? '?'}`,
  'timeline.reasoningEffort': ({ effort }) => `Effort de raisonnement : ${effort ?? '?'}`,
  'timeline.comment': ({ author }) => `Commentaire de ${author}`,

  'intervention.title.prReady': () => 'PR prête à approuver',
  'intervention.title.mainRed': () => 'Main rouge après le merge',
  'intervention.title.gaveUp': ({ failures }) =>
    failures === null
      ? 'Abandon après plusieurs échecs'
      : `Abandon après ${failures} ${f.plural(failures, 'échec', 'échecs')}`,
  'intervention.title.needsInput': () => 'Décision attendue',
  'intervention.title.capability': () => 'Outil ou accès manquant',
  'intervention.title.transient': () => 'Échec passager',
  'intervention.title.blocked': () => 'Carte bloquée',
  'intervention.title.triageLoop': () =>
    'Bloquée deux fois pour la même raison : carte passée en triage',
  'intervention.title.held': ({ minutes }) => `Carte prête mais retenue depuis ${minutes} min`,
  'intervention.question.prReady': () =>
    'La gate a approuvé la PR : ton approbation sur GitHub déclenche le merge.',
  'intervention.question.gaveUp': () => 'Le disjoncteur du dispatcher a arrêté la carte.',
  'intervention.question.needsInput': () => 'L’agent attend ta décision.',
  'intervention.question.capability': () => 'Un outil ou un accès manque à l’agent.',
  'intervention.question.transient': () => 'Échec passager de la lane.',
  'intervention.question.blocked': () => 'Carte bloquée sans raison donnée.',
  'intervention.question.triageLoop': () =>
    '`/factory unblock` ne s’applique pas à une carte en triage. Sors-la par le tableau de bord d’Hermès (glisser vers Ready), jamais par specify ni decompose : un spécificateur pourrait réécrire le brief.',
  'intervention.question.held': () =>
    'Le dispatcher retient la carte : un commentaire de moins de 24 h cite une URL de PR, sans relais depuis. C’est la garde `active_pr` d’Hermès contre les PR en double. La carte n’est pas bloquée, `/factory unblock` ne s’applique donc pas : il faut la relayer.',
  'intervention.action.openIssue': ({ issueKey }) => `Ouvrir l’issue ${issueKey}`,
  'intervention.action.showCard': () => 'Voir la carte en CLI',
  'intervention.action.approvePr': () => 'Approuver la PR sur GitHub',
  'intervention.action.prWorkflows': () => 'Voir la PR et ses workflows',
  'intervention.action.reassignCoder': () => 'Réassigner à coder (Hermès natif)',
  'intervention.action.dashboard': () => 'Ouvrir le tableau de bord d’Hermès',
  'intervention.action.relay': ({ owner }) => `Relancer par relais (scribe puis ${owner})`,

  'diagnosis.summary.guardHookTimeout': ({ plugin, seconds }) =>
    `${plugin ? `Le contrôle de ${plugin}` : 'Un contrôle'} dépasse le délai des hooks d’Hermès (${secs(seconds)})`,
  'diagnosis.summary.guardHookHung': ({ plugin }) =>
    `${plugin ?? 'Une garde'} ne répond plus : Hermès refuse les outils de l’agent`,
  'diagnosis.summary.guardHookRaised': ({ plugin }) =>
    `${plugin ?? 'Une garde'} plante à chaque appel : Hermès refuse l’outil`,
  'diagnosis.summary.pluginLoadFailed': ({ plugin }) =>
    `Le plugin ${plugin} ne se charge pas : ses contrôles ne tournent plus`,
  'diagnosis.summary.stoppedAfterRefusals': () => 'L’agent s’est arrêté après des outils refusés',
  'diagnosis.summary.stoppedWithoutKanbanCall': ({ count }) =>
    count > 1
      ? `Le modèle s’arrête sans rendre la carte (${count} fois)`
      : 'Le modèle s’est arrêté sans rendre la carte',
  'diagnosis.summary.protocolBreaker': ({ count }) =>
    `Hermès a arrêté la carte après ${count} sorties sans appel kanban`,
  'diagnosis.summary.iterationBudget': ({ max }) => `L’agent a épuisé ses ${max} tours`,
  'diagnosis.summary.runtimeLimit': ({ seconds }) =>
    `Le run a dépassé sa durée maximale (${secs(seconds)})`,
  'diagnosis.summary.toolDeadline': ({ tool, seconds }) =>
    `L’outil ${tool} a dépassé le plafond d’Hermès (${secs(seconds)})`,
  'diagnosis.summary.commandTimeout': ({ seconds }) =>
    `Une commande a dépassé le délai du terminal (${secs(seconds)})`,
  'diagnosis.summary.guardRefusal': ({ plugin }) => `${plugin} refuse l’action de l’agent`,
  'diagnosis.summary.refusalLoop': ({ plugin, count }) =>
    `L’agent bute ${count} fois sur le même refus de ${plugin}`,
  'diagnosis.summary.providerQuota': ({ provider }) =>
    `Quota de ${provider ?? 'son fournisseur'} atteint : la carte attend`,
  'diagnosis.summary.providerTerminal': ({ provider }) =>
    `${provider ?? 'Le fournisseur'} refuse la clé ou le modèle de l’agent`,
  'diagnosis.summary.prAcceptanceInfra': () => 'Hermès n’a pas pu vérifier la PR sur GitHub',
  'diagnosis.summary.heldActivePr': ({ minutes }) =>
    `Carte prête mais retenue depuis ${minutes} min (garde active_pr)`,
  'diagnosis.summary.triageLoop': () => 'Deux blocages identiques : la carte est passée en triage',
  'diagnosis.summary.question': () => 'L’agent attend ta décision',
  'diagnosis.summary.unexplained': () => 'Blocage sans cause reconnue',
  'diagnosis.why.guardHookTimeout': ({ plugin, trigger, seconds }) =>
    `${plugin ?? 'Une garde'} fait tourner ses contrôles dans un hook pre_tool_call${trigger ? `, à chaque ${trigger}` : ''}. Hermès coupe ce hook après ${secs(seconds)}, refuse l’outil, puis refuse tous les outils de l’agent pendant 60 s : il ne peut plus ni commiter ni rendre la carte. Les contrôles coupés continuent de tourner et ralentissent le suivant.`,
  'diagnosis.why.guardHookHung': ({ plugin, workers }) =>
    `${plugin ?? 'La garde'} ne rend plus la main${workers ? ` : ${workers} ${f.plural(workers, 'appel abandonné tourne', 'appels abandonnés tournent')} encore` : ''}. Hermès refuse tous les outils de l’agent tant qu’un de ces appels n’a pas fini.`,
  'diagnosis.why.guardHookRaised': ({ plugin }) =>
    `Le hook pre_tool_call de ${plugin ?? 'la garde'} lève une exception à chaque appel. Une garde qui plante ne décide rien : Hermès refuse l’outil par prudence.`,
  'diagnosis.why.pluginLoadFailed': ({ plugin }) =>
    `Hermès n’a pas pu charger ${plugin} au démarrage de l’agent : ses contrôles et ses notifications ne tournent pas.`,
  'diagnosis.why.stoppedAfterRefusals': () =>
    'Ses derniers appels ont été refusés, y compris ceux qui rendent la carte (kanban_complete, kanban_request_review) : l’agent est sorti sans terminer ni bloquer la carte.',
  'diagnosis.why.stoppedWithoutKanbanCall': ({ nudges }) =>
    `Le modèle a fini son tour sans appeler kanban_complete, kanban_request_review ni kanban_block${nudges ? `, malgré ${nudges} ${f.plural(nudges, 'relance', 'relances')} d’Hermès` : ''}. Aucun outil ne lui a été refusé : la cause est le modèle, pas la factory.`,
  'diagnosis.why.protocolBreaker': ({ count }) =>
    `Après ${count} sorties sans appel kanban d’affilée, le disjoncteur d’Hermès bloque la carte, sans type ni question.`,
  'diagnosis.why.iterationBudget': ({ used, max }) =>
    `Le run a utilisé ${used} tours sur ${max} sans finir : Hermès l’a arrêté.`,
  'diagnosis.why.runtimeLimit': ({ seconds, limit }) =>
    `Le run a tourné ${secs(seconds)} pour une limite de ${secs(limit)} : Hermès l’a arrêté.`,
  'diagnosis.why.toolDeadline': ({ tool, seconds }) =>
    `Hermès plafonne chaque appel d’outil, hooks compris, à ${secs(seconds)} : l’appel ${tool} a été coupé.`,
  'diagnosis.why.commandTimeout': ({ seconds }) =>
    `Une commande du terminal a dépassé ${secs(seconds)} et a été arrêtée.`,
  'diagnosis.why.guardRefusal': ({ plugin }) =>
    `${plugin} est une garde de la factory : elle refuse ce qui ne respecte pas ses règles, et l’agent doit corriger avant de recommencer. C’est le fonctionnement normal.`,
  'diagnosis.why.refusalLoop': ({ plugin, count }) =>
    `L’agent a reçu ${count} fois le même refus de ${plugin} sans changer d’approche : il tourne en rond.`,
  'diagnosis.why.providerQuota': ({ provider }) =>
    `${provider ?? 'Le fournisseur'} répond 429 : Hermès met la carte en attente, puis la relance seul.`,
  'diagnosis.why.providerTerminal': ({ provider }) =>
    `${provider ?? 'Le fournisseur'} rejette la clé ou le modèle configuré : relancer ne sert à rien tant que ce n’est pas corrigé.`,
  'diagnosis.why.prAcceptanceInfra': () =>
    'Le contrôle de PR du noyau kanban n’a pas pu interroger GitHub (gh trop ancien, ou authentification).',
  'diagnosis.why.heldActivePr': () =>
    'Hermès retient une carte qui a cité une PR il y a moins de 24 h, pour éviter les PR en double. Il faut un relais : scribe, puis l’agent d’origine.',
  'diagnosis.why.triageLoop': () =>
    'Deux blocages du même type de suite : Hermès met la carte en triage, où « Débloquer » ne s’applique plus.',
  'diagnosis.why.question': () =>
    'L’agent pose une question et aucune cause technique n’apparaît dans ses derniers appels : il attend ta réponse.',
  'diagnosis.why.unexplained': () =>
    'Aucune règle ne reconnaît ce blocage. Voici les derniers signaux bruts, et ce que l’agent a écrit.',
  'diagnosis.step.setValue': ({ key, value, profile }) =>
    `Passer ${key} à ${value} pour ${profile}`,
  'diagnosis.step.reportInRepo': ({ path }) =>
    `Reporter la valeur dans ${path} du dépôt de la factory, sinon le prochain ./install.sh l’efface`,
  'diagnosis.step.verifyValue': ({ key }) => `Vérifier la valeur en service de ${key}`,
  'diagnosis.step.unblockWithTemplate': () => 'Débloquer avec la réponse préremplie ci-dessous',
  'diagnosis.step.answer': () => 'Répondre à la question de l’agent, ci-dessous',
  'diagnosis.step.fixPlugin': ({ plugin }) => `Corriger ${plugin} dans le dépôt de la factory`,
  'diagnosis.step.reinstall': () => 'Lancer ./install.sh quand aucune carte ne tourne',
  'diagnosis.step.chooseModel': () =>
    'Donner un autre modèle à la carte : un label claude:… sur l’issue',
  'diagnosis.step.giveCommand': () =>
    'Dans ta réponse, donner à l’agent la commande exacte qui respecte la garde',
  'diagnosis.step.wait': ({ minutes }) =>
    `Rien à faire : la carte repart seule dans ${minutes} min`,
  'diagnosis.step.checkProvider': ({ provider }) =>
    `Vérifier la clé et le modèle de ${provider ?? 'son fournisseur'}`,
  'diagnosis.step.relay': ({ owner }) => `Relancer par relais : scribe, puis ${owner}`,
  'diagnosis.step.leaveTriage': () =>
    'Sortir la carte du triage depuis le tableau de bord d’Hermès',
  'diagnosis.step.raiseLimit': ({ key, profile }) =>
    `Relever ${key} pour ${profile}, ou découper la carte`,
  'diagnosis.evidence.toolRefusals': ({ count, tools }) =>
    `${count} ${f.plural(count, 'outil refusé', 'outils refusés')} (${tools})`,
  'diagnosis.evidence.hookTimedOut': ({ callback, seconds }) =>
    `hook ${callback} coupé après ${secs(seconds)}`,
  'diagnosis.evidence.trigger': ({ tool }) => `premier appel coupé : ${tool}`,
  'diagnosis.evidence.settingMissing': ({ key, seconds }) =>
    `${key} absent de la config : ${secs(seconds)} par défaut`,
  'diagnosis.evidence.settingValue': ({ key, value }) => `${key} : ${value}`,
  'diagnosis.evidence.settingChanged': ({ key, value }) => `${key} passé à ${value}`,
  'diagnosis.evidence.toolDeadlineCap': ({ seconds }) =>
    `plafond des outils d’Hermès : ${secs(seconds)}, hook compris`,
  'diagnosis.evidence.pluginHook': ({ plugin, callback, hook }) =>
    `${plugin} branche ${callback} sur ${hook}`,
  'diagnosis.evidence.workerExited': () => 'sortie du worker sans appel kanban',
  'diagnosis.evidence.stopNudges': ({ count }) =>
    `${count} ${f.plural(count, 'relance', 'relances')} d’Hermès pour rendre la carte`,
  'diagnosis.evidence.guardMessage': ({ plugin, count }) =>
    `refus de ${plugin}${count > 1 ? ` (${count} fois)` : ''}`,
  'diagnosis.evidence.commitPassed': ({ seconds }) => `commit contrôlé passé en ${secs(seconds)}`,
  'diagnosis.evidence.breaker': ({ count }) =>
    `disjoncteur après ${count} sorties sans appel kanban`,
  'diagnosis.evidence.apiErrors': ({ count, provider }) =>
    `${count} ${f.plural(count, 'erreur', 'erreurs')} d’API${provider ? ` chez ${provider}` : ''}`,
  'diagnosis.evidence.lastSignals': ({ count }) =>
    `${count} ${f.plural(count, 'dernier signal', 'derniers signaux')}`,
  'diagnosis.run.modelStopped': () => 'arrêté sans appel kanban (le modèle)',
  'diagnosis.run.refusedThenStopped': ({ count }) =>
    `${count} ${f.plural(count, 'outil refusé', 'outils refusés')}, puis sortie sans appel kanban`,
  'diagnosis.run.blockedAfterRefusals': ({ count }) =>
    `bloqué après ${count} ${f.plural(count, 'outil refusé', 'outils refusés')}`,
  'diagnosis.run.breaker': () => 'arrêté par le disjoncteur d’Hermès',
  'diagnosis.run.timedOut': () => 'arrêté par une limite d’Hermès',
  'diagnosis.run.quota': () => 'mis en attente par le fournisseur',
  'diagnosis.run.refusalLoop': ({ count }) => `${count} fois le même refus`,
  'diagnosis.run.unexplained': ({ outcome }) => `${outcomeLabel(outcome)}, sans cause reconnue`,
  'diagnosis.unblock.hookTimeoutFixed': ({ plugin, seconds, value, branch, committed, evidence }) =>
    [
      `Le blocage ne venait pas de ton travail : ${plugin ?? 'une garde'} dépassait le délai de ${secs(seconds)} des hooks d’Hermès, d’où les outils refusés. Ce délai est maintenant de ${secs(value)}.`,
      `Ne refais pas l’implémentation : elle est dans ton worktree${branch ? `, sur ${branch}` : ''}${committed ? '' : ', non commitée'}${evidence ? `, et tes ${evidence} ${f.plural(evidence, 'preuve est', 'preuves sont')} dans evidence/` : ''}. Relis le diff, puis termine le parcours : git add fichier par fichier, puis git commit dans une commande séparée (le contrôle prend plusieurs minutes : attends sa réponse sans relancer), push, PR en brouillon, puis kanban_request_review.`,
      'Si un outil se bloque encore, appelle kanban_block avec le message d’erreur exact au lieu de finir le run sans appel kanban.',
    ].join('\n\n'),
  'diagnosis.unblock.causeFixed': ({ branch }) =>
    `La cause du blocage est corrigée côté factory. Reprends où tu en étais${branch ? `, sur ${branch}` : ''}, sans refaire ce qui est déjà fait, et termine par kanban_request_review, ou par kanban_block avec le message exact si ça coince encore.`,
  'diagnosis.unblock.refusalLoop': ({ plugin, refusal }) =>
    `Tu reçois toujours le même refus de ${plugin} : « ${refusal} ». Fais exactement ce qu’il demande avant de recommencer, sans chercher à le contourner. Si tu ne vois pas comment, appelle kanban_block en citant ce refus.`,
  'diagnosis.unblock.finishWithKanbanCall': () =>
    'Reprends la carte où tu en étais, et termine toujours ton run par un appel kanban : kanban_request_review si le travail est prêt, kanban_block avec la raison exacte sinon. Ne t’arrête jamais sur un simple message.',

  'health.gateway': () => 'Gateway Hermès',
  'health.gateway.running': ({ seconds }) => `En marche, sonde reçue ${f.ago(seconds)}`,
  'health.gateway.silent': ({ seconds }) => `Muet depuis ${f.span(seconds)}`,
  'health.gateway.never': () => 'Aucune nouvelle de la sonde depuis le démarrage de factory-live',
  'health.dispatcher': () => 'Dispatcher kanban',
  'health.dispatcher.noTick': () => 'Aucun tick reçu (webhooks du gateway non branchés ?)',
  'health.dispatcher.paused': ({ seconds }) => `En pause, dernier tick ${f.ago(seconds)}`,
  'health.dispatcher.lastTick': ({ seconds }) => `Dernier tick ${f.ago(seconds)}`,
  'health.webhook': () => 'Écouteur des webhooks GitHub',
  'health.notReported': () => 'Pas encore rapporté par la sonde',
  'health.provider': ({ provider }) => `Fournisseur ${provider}`,
  'health.nvidia': () => 'API NVIDIA',
  'health.provider.lastOk': ({ seconds }) => `Dernier appel réussi ${f.ago(seconds)}`,
  'health.provider.none': () => 'Aucun appel réussi observé',
  'health.claude': () => 'Claude Code (abonnement)',
  'health.claude.none': () => 'Aucune lane Claude observée',
  'health.claude.lastSession': ({ seconds }) => `Dernière session ${f.ago(seconds)}`,
  'health.github': () => 'API GitHub',
  'health.github.notYet': () => 'Pas encore interrogée',
  'health.github.ok': () => 'Accès GitHub valide',
  'health.github.token': () => 'Jeton fine-grained de repli',
  'health.github.app.user': ({ slug, login }) => `App ${slug}, connecté en tant que ${login}`,
  'health.github.app.fallback': ({ slug }) => `App ${slug}, déblocage par le jeton de repli`,
  'health.github.app.loginNeeded': ({ slug }) =>
    `App ${slug}, connexion GitHub requise pour débloquer`,
  'health.github.noAccess': () => 'Aucun accès GitHub : crée et installe l’App factory-live',
  'health.github.loginToWrite': () =>
    'Connecte-toi à GitHub dans factory-live pour écrire en ton nom',
  'health.github.unauthorized': () => 'Accès refusé (401) : reconnecte ou réinstalle l’App GitHub',
  'health.github.forbidden': () => 'Accès refusé ou quota épuisé (403)',
  'health.github.error': ({ status, issue }) => `Erreur ${status ?? 'réseau'} sur ${issue}`,
  'health.github.noToken': () =>
    'Aucun jeton dans ~/.config/factory-live/github-token : lecture seule du kanban',
  'health.githubDeliveries': () => 'Webhooks GitHub (vus par GitHub)',
  'health.githubDeliveries.last': ({ status, seconds }) =>
    `Dernière livraison : HTTP ${status} ${f.ago(seconds)}`,
  'health.probe': () => 'Sonde factory-live-probe',
  'health.probe.last': ({ seconds }) => `Dernier rapport ${f.ago(seconds)}`,
  'health.probe.none': () => 'Aucun rapport reçu (sonde pas encore déployée ?)',
  'health.sources': () => 'Sources de factory-live',
  'health.sources.detail': ({ kanban, cards, kanbanError, sessionsError }) => {
    const read =
      kanban === 'pending'
        ? 'kanban.db pas encore lu'
        : kanban === 'read'
          ? `kanban.db lu (${cards} ${f.plural(cards, 'carte', 'cartes')})`
          : `kanban.db illisible : ${kanbanError ?? '?'}`;
    return `${read} ; ${sessionsError ?? 'sessions lisibles à la demande'}`;
  },
  'health.metric.running': () => 'En cours',
  'health.metric.perAgent': () => 'Par agent',
  'health.metric.rateLimited': () => '429 sur 10 min',
  'health.metric.quota': () => 'Quota restant',
  'health.metric.hooksPerMinute': () => 'Webhooks par minute',
  'health.metric.lastHook': () => 'Dernier webhook',
  'health.value.ofTotal': ({ value, total }) =>
    `${f.integer(value)} sur ${total === null ? '?' : f.integer(total)}`,
  'health.value.atMost': ({ max }) => `${max} au plus`,
  'health.value.none': () => 'aucun',
  'health.value.ago': ({ seconds }) => f.ago(seconds),
  'health.guards': () => 'Délais des gardes',
  'health.guards.ok': () => 'Chaque garde finit dans le délai de son hook',
  'health.guards.risk': ({ count }) =>
    count > 1
      ? `${count} gardes peuvent dépasser le délai de leur hook`
      : 'Une garde peut dépasser le délai de son hook',
  'health.guards.riskItem': ({ profile, plugin }) => `${plugin} sur ${profile}`,
  'health.guards.limits': ({ longest, limit }) =>
    `commandes jusqu’à ${secs(longest)}, hook coupé à ${secs(limit)}`,

  'github.labeled': ({ label, actor }) => `Label ${label} posé par ${actor}`,
  'github.prOpened': ({ pr, draft }) => `PR #${pr} ouverte${draft ? ' en brouillon' : ''}`,
  'github.diffstat': ({ additions, deletions, files }) =>
    `+${additions} −${deletions}, ${files} ${f.plural(files, 'fichier', 'fichiers')}`,
  'github.reviewRequested': ({ pr, reviewer, autoMerge }) =>
    `PR #${pr} : revue demandée à @${reviewer}${autoMerge === true ? ', auto-merge armé' : autoMerge === false ? ', sans auto-merge' : ''}`,
  'github.merged': () => 'Fusionné dans main, workflows verts',
  'github.answerPosted': ({ issueKey }) => `Réponse postée sur ${issueKey}`,
  'github.answerAcknowledged': () => 'Le bot a pris la réponse en compte',
  'unblock.sent': () => 'Réponse envoyée depuis factory-live',

  'transcript.hermes': ({ profile, session }) =>
    `Session Hermès de ${profile}${session ? ` (${session})` : ''}`,
  'transcript.claudeCode': ({ costUsd }) =>
    `Lane Claude Code${costUsd === null ? '' : ` (${f.usd(costUsd)})`}`,
  'agent.role.default': () => 'agent Hermès',
  'usage.claudeNote': () =>
    'Le solde de l’abonnement Claude n’a pas de source fiable : factory-live n’affiche une limite que si une transcription Claude Code la signale.',
  'push.test.title': () => 'factory-live : test',
  'push.test.body': () => 'Les notifications de cet appareil fonctionnent.',
};

export const fr = {
  station,
  stationHint: {
    intake: 'Issue labellisée factory, carte créée',
    brief: 'Le coordinateur écrit le brief et le graphe de cartes',
    implementation: 'Test qui échoue, correctif, preuves, PR en brouillon',
    gate: 'Vérification indépendante, CI verte exigée',
    release: 'Ton approbation, merge, tag, CI de main',
    done: 'Mergé, workflows de main verts',
    stopped: 'Arrêté ou PR fermée',
    side: 'Triage, watch, onboarding',
  } satisfies Record<StationId, string>,
  agentState: {
    idle: 'Au repos',
    queued: 'En file',
    thinking: 'Réfléchit',
    tool: 'Outil',
    cli: 'Lane CLI',
    blocked: 'Bloqué',
  } satisfies Record<AgentState, string>,
  issueStatus: {
    active: 'En cours',
    queued: 'En file',
    waiting_human: 'Attend ta décision',
    blocked: 'Bloquée',
    done: 'Terminée',
    stopped: 'Arrêtée',
  } satisfies Record<IssueStatus, string>,
  intervention,
  /** Ce qu'on fait d'une intervention, depuis la boîte de l'issue sur la ligne d'usine. */
  interventionAction: {
    needs_input: 'Répondre',
    capability: 'Répondre',
    transient: 'Débloquer',
    gave_up: 'Débloquer',
    triage_loop: 'Voir la procédure',
    held_active_pr: 'Voir les commandes',
    pr_approval: 'Approuver la PR',
    main_red: 'Voir les runs',
    service_down: 'Voir la santé',
  } satisfies Record<InterventionKind, string>,
  cardKind: {
    brief: 'Brief',
    impl: 'Implémentation',
    release: 'Release',
    diagnostic: 'Diagnostic',
    watch: 'Surveillance',
    onboarding: 'Onboarding',
    other: 'Autre',
  } satisfies Record<CardKind, string>,
  cardStatus,
  runOutcome,
  runRole: {
    coordinator: 'coordination',
    implementer: 'implémentation',
    reviewer: 'revue',
    release: 'release',
    other: 'autre',
  } satisfies Record<RunRole, string>,
  modelSource: {
    live: 'observé sur le dernier appel',
    session: 'enregistré dans la session',
    override: 'forcé sur la carte',
    config: 'configuration de l’agent',
  } satisfies Record<ModelRef['source'], string>,
  healthStatus: {
    ok: 'OK',
    degraded: 'Dégradé',
    down: 'En panne',
    unknown: 'Inconnu',
  } satisfies Record<HealthStatus, string>,

  common: {
    /** « libellé : valeur », pour un titre composé ou une infobulle. */
    labelValue: (label: string, value: string) => `${label} : ${value}`,
    /** Les deux-points entre un libellé et sa valeur mis en forme à part (espace avant en français). */
    colon: ' : ',
    free: 'gratuit',
    unknown: '?',
    lane: 'lane',
    issueCount: (count: number) => `${count} ${f.plural(count, 'issue', 'issues')}`,
    cardCount: (count: number) => `${count} ${f.plural(count, 'carte', 'cartes')}`,
    /** Une issue ou une carte qui attend une place : le plafond du dispatcher. */
    waitingForSlot: (max: number) =>
      `Attend une place : ${max} ${f.plural(max, 'carte', 'cartes')} en cours au plus`,
  },

  nav: {
    line: 'Ligne d’usine',
    lineShort: 'Ligne',
    issues: 'Issues',
    interventions: 'Interventions',
    agents: 'Agents',
    health: 'Santé',
    costs: 'Coûts et quotas',
    history: 'Historique et stats',
    settings: 'Réglages',
    more: 'Plus',
    main: 'Navigation principale',
    tabs: 'Navigation',
  },

  shell: {
    home: 'factory-live, revenir à la ligne d’usine',
    offline: 'Hors ligne',
    lastState: 'dernier état',
    unreachable: 'factory-live injoignable',
    connecting: 'Connexion…',
    paused: (reason: string | null) => (reason ? `En pause : ${reason}` : 'En pause'),
    live: 'En direct',
    silent: 'Factory muette',
    running: (running: number, max: number) =>
      `${running} ${f.plural(running, 'carte', 'cartes')} en cours sur ${max}`,
    demo: 'Démo',
    replayDemo: 'Rejouer le scénario de démonstration',
    interventionsWaiting: (count: number) => `Interventions : ${count} en attente`,
    servicesToWatch: (count: number) =>
      `${count} ${f.plural(count, 'service', 'services')} à surveiller`,
    /** Étiquette du badge du board Hermès que lit factory-live, au pied de la navigation. */
    board: 'board',
  },

  motion: {
    reduced: 'Animations réduites par le système',
    resume: 'Relancer les animations',
    pause: 'Mettre les animations en pause',
  },

  notFound: {
    title: 'Page introuvable',
    text: 'Cette adresse ne correspond à aucune vue.',
    back: 'Revenir à la ligne d’usine',
  },

  line: {
    title: 'Ligne d’usine',
    openIssues: (count: number) => `${count} ${f.plural(count, 'issue', 'issues')} en cours`,
    lastEvent: 'dernier événement',
    blockersWaiting: (count: number) =>
      count > 1 ? `${count} blocages t’attendent` : `${count} blocage t’attend`,
    blockerItem: (where: string | null, title: string) => `${where ?? 'carte'} : ${title}`,
    seeInterventions: 'Voir les interventions',
    label: 'Ligne d’usine : les étapes d’une issue, de l’intake au merge',
    /** Ajouté au titre d'une étape, pour les lecteurs d'écran. */
    stepIssues: (count: number) => ` : ${count} ${f.plural(count, 'issue', 'issues')}`,
    issuesAt: (station: string) => `Issues à l’étape ${station}`,
    crewOf: (station: string) => `Agents de l’étape ${station}`,
    now: 'En ce moment',
    allAgents: 'Tous les agents',
    noAgent: 'Aucun agent au travail : la ligne attend une issue labellisée factory.',
  },

  activity: {
    title: 'Activité',
    filterLabel: 'Filtrer l’activité',
    filters: {
      all: 'Tout',
      tools: 'Outils',
      models: 'Modèles',
      kanban: 'Kanban',
      github: 'GitHub',
    },
    empty: 'Rien pour ce filtre pour l’instant.',
    label: 'Activité de la factory',
    running: 'en cours',
    kind: {
      tool: 'Outil',
      llm: 'Modèle',
      kanban: 'Kanban',
      github: 'GitHub',
      skill: 'Skill',
      guard: 'Garde',
      system: 'Système',
    },
    source: {
      kanban: 'Kanban',
      hermes: 'Hermès',
      github: 'GitHub',
      comment: 'Commentaire',
      'factory-live': 'factory-live',
    },
    refused: 'Refus',
    failed: (kind: string) => `${kind} en échec`,
    /** Un événement répété à chaque tick, fusionné en une ligne. */
    repeats: (count: number) => ` (${count} fois)`,
  },

  model: {
    /** Infobulle d'un modèle : « lane : modèle via fournisseur, d'où vient l'information ». */
    description: (
      lane: string | null,
      model: string,
      provider: string | null,
      source: string | null,
    ) =>
      `${lane ? `${lane} : ` : ''}${model}${provider ? ` via ${provider}` : ''}${source ? `, ${source}` : ''}`,
  },

  issues: {
    title: 'Issues',
    filterLabel: 'Filtrer les issues',
    filters: { open: 'Ouvertes', finished: 'Terminées', all: 'Toutes' },
    interventions: (count: number) => ` ${f.plural(count, 'intervention', 'interventions')}`,
    updated: 'mise à jour',
  },

  issue: {
    notFound: 'Issue introuvable',
    backToList: 'Revenir à la liste des issues',
    breadcrumb: 'Fil d’Ariane',
    stage: (station: string) => `Étape : ${station}`,
    onGitHub: 'Issue sur GitHub',
    facts: {
      harness: 'Harnais',
      harnessPending: 'choisi au brief',
      claudeModel: 'Modèle Claude',
      noClaudeModel: 'aucun (pas de label claude)',
      pr: 'PR',
      prUnknownState: '(état inconnu : GitHub pas encore relié)',
      prNotOpened: 'pas encore ouverte',
      duration: 'Durée',
      tokens: 'Jetons',
      cost: 'Coût estimé',
      noCost: 'nul (modèles gratuits)',
    },
    bannerDescription: 'Ta réponse ou ton action est attendue pour que la carte reparte.',
    reply: 'Répondre',
    seeDiagnosis: 'Voir le diagnostic',
    cardCause: 'Pourquoi elle bloque',
    cardsTitle: 'Cartes de l’issue',
    cardsHint: 'Choisis une carte pour voir ses runs.',
    forcedSkills: 'Skills forcées :',
    unassigned: 'non assignée',
    tabsLabel: 'Détails de l’issue',
    tabs: {
      activity: 'Activité',
      transcript: 'Transcription',
      pr: 'PR et CI',
      costs: 'Coûts',
      evidence: 'Preuves',
    },
    activityOf: (key: string) => `Activité de ${key}`,
    noRun: 'Aucun run pour l’instant.',
    runs: {
      notYet: 'Cette carte n’a pas encore tourné.',
      of: (cardId: string) => `Runs de la carte ${cardId}`,
      running: 'en cours',
      transcriptOf: (runId: number) => `Transcription du run #${runId}`,
      run: 'Run',
      agent: 'Agent',
      model: 'Modèle',
      outcome: 'Résultat',
      duration: 'Durée',
      transcript: 'Transcription',
    },
    costs: {
      label: 'Consommation par run',
      run: 'Run',
      agent: 'Agent',
      model: 'Modèle',
      tokens: 'Jetons',
      cost: 'Coût',
    },
    evidence: (cardId: string | null) =>
      `Fichiers de preuve de la carte sélectionnée (${cardId ?? 'aucune'}), tels qu’ils sont dans evidence/ de son worktree.`,
    evidenceEmpty: 'Aucun fichier dans evidence/ pour cette carte.',
    evidenceFile: (size: string, time: string) => `${size}, ${time}`,
    bytes: (bytes: number) =>
      bytes < 1024
        ? `${bytes} o`
        : bytes < 1024 * 1024
          ? `${f.integer(Math.round(bytes / 1024))} Ko`
          : `${f.integer(Math.round(bytes / (1024 * 1024)))} Mo`,
    graph: 'Graphe des cartes de l’issue',
    cardsOf: (title: string) => `Cartes : ${title}`,
    releaseTitle: 'Merge, tag et surveillance de main',
    testsPassed: (passed: number, total: number) => `${passed} tests réussis sur ${total}`,
    tests: (passed: number, total: number) => `${passed}/${total} tests`,
    files: (count: number) => `${count} ${f.plural(count, 'fichier', 'fichiers')}`,
  },

  pr: {
    checks: [
      { name: 'Tests', detail: 'Windows, macOS, Ubuntu × Node 22 et 24' },
      { name: 'E2E', detail: 'Electron, scénarios des cartes' },
      { name: 'GitHub Pages', detail: 'Site de présentation' },
    ],
    spottedBefore: 'PR ',
    spottedAfter:
      ' relevée par la factory ; son état, ses revues et sa CI s’afficheront une fois GitHub relié (Réglages, GitHub).',
    none: 'Pas encore de PR : elle s’ouvre en brouillon à la fin de l’implémentation.',
    state: { draft: 'Brouillon', merged: 'Fusionnée', closed: 'Fermée', open: 'Ouverte' },
    /** L'état de la CI d'une PR, après « CI ». */
    /** Le badge de la CI d'une PR : son étiquette, puis l'état des workflows. */
    ciLabel: 'CI',
    ci: {
      pending: 'en cours',
      success: 'réussie',
      failure: 'en échec',
    } satisfies Record<Exclude<ChecksState, 'none'>, string>,
    changes: 'Changements',
    review: 'Revue',
    reviewDecision: {
      approved: 'Approuvée',
      changes_requested: 'Changements demandés',
      review_required: 'Ton approbation est attendue',
      none: 'Pas encore demandée',
    },
    autoMerge: 'Auto-merge',
    autoMergeOn: 'Armé : le merge part dès ton approbation',
    autoMergeOff: 'Non (dépôt privé ou PR en brouillon)',
    workflows: 'Workflows de la PR',
    approve: 'Approuver sur GitHub',
    open: 'Ouvrir la PR sur GitHub',
  },

  transcript: {
    role: {
      user: 'Consigne',
      assistant: 'Réponse',
      reasoning: 'Raisonnement',
      tool_call: 'Appel d’outil',
      tool_result: 'Résultat',
      system: 'Session',
    },
    source: {
      hermes: 'Session Hermès',
      'claude-code': 'Claude Code',
      opencode: 'OpenCode',
      terminal: 'Terminal',
    },
    showAll: (characters: string) => `Afficher en entier (${characters} caractères)`,
    notKept:
      'Transcription non conservée pour ce run : Hermès purge les sessions des cartes terminées après 30 jours.',
    sourceLabel: 'Source de la transcription',
    rawLog: (runId: number) => `Log brut du run ${runId}`,
    redaction: 'Les secrets (jetons, clés, mots de passe) sont masqués avant affichage.',
  },

  interventions: {
    title: 'Interventions',
    intro:
      'Ce qui attend ta décision. Une cloche signale ce qui t’envoie une notification push ; le reste se voit ici et sur la ligne.',
    listLabel: 'Interventions en attente',
    empty: 'Rien n’attend ta décision.',
    push: 'Notification push',
    opened: 'ouverte',
    progress: {
      sent: 'Réponse envoyée',
      acknowledged: 'Réponse prise en compte',
      resumed: 'Réponse appliquée',
      rejected: 'Réponse refusée',
    },
    all: 'Toutes les interventions',
    resolved: 'Cette intervention est résolue.',
    severity: { critical: 'Bloquant', warning: 'À traiter', info: 'Pour info' },
    pushSent: '· notification push envoyée',
    openedAt: (time: string) => `ouverte à ${time}`,
    question: 'Question de l’agent',
    steps: {
      sent: {
        label: 'Réponse postée sur l’issue',
        hint: 'commentaire /factory unblock en ton nom',
      },
      acknowledged: {
        label: 'Prise en compte par le bot',
        hint: 'réaction +1, relais active_pr si besoin',
      },
      resumed: {
        label: 'Carte repartie',
        hint: 'le dispatcher la relance dès qu’une place se libère',
      },
    },
    copied: 'Copiée',
    copy: 'Copier la commande',
    tracking: 'Suivi de ta réponse',
    viewComment: 'Voir le commentaire sur GitHub',
    emptyAnswer: 'Écris ta réponse : elle est postée telle quelle sur l’issue.',
    sendFailed: 'Envoi impossible, réessaie.',
    answer: 'Ta réponse',
    placeholder: 'Par exemple : option 2, filtres en pastilles au-dessus de la grille.',
    caption: (issueKey: string | null) =>
      `Postée sur ${issueKey ?? ''} en commentaire « /factory unblock », exactement comme si tu répondais depuis l’issue. Elle débloque toutes les cartes bloquées de l’issue.`,
    unblock: 'Débloquer',
    prefilled:
      'Réponse préremplie à partir du diagnostic : relis-la et modifie-la si besoin avant de l’envoyer.',
    unblockAnyway: 'Débloquer quand même',
    confirmAnyway: 'Confirmer le déblocage',
    cancel: 'Annuler',
    anywayWarning: (triage: boolean) =>
      `La cause est toujours là : l’agent va retomber dans le même échec.${triage ? ' S’il rebloque pour la même raison, la carte part en triage, où « Débloquer » ne s’applique plus.' : ''}`,
    causeFixed: (time: string) => `Cause corrigée à ${time} : tu peux débloquer.`,
    rejected: {
      label: 'Réponse refusée par le bot',
      hint: 'Le bot a réagi « confused » : plus aucune carte bloquée sur l’issue, ou commande non reconnue.',
    },
    recent: 'Récemment débloquées',
    resolvedLabel: 'Débloquée',
    resolvedAt: (time: string) => `débloquée à ${time}`,
    runAfter: 'Run suivant',
  },

  diagnosis: {
    label: 'Diagnostic du blocage',
    why: 'Pourquoi',
    who: 'Qui agit',
    enough: 'Débloquer suffit ?',
    todo: 'Que faire',
    evidence: 'Preuves',
    evidenceCount: (count: number) => `${count} ${f.plural(count, 'fait', 'faits')}`,
    runs: 'Runs de l’épisode',
    work: 'Travail de la carte',
    others: 'Autres constats',
    agentText: 'Ce que l’agent a écrit',
    actor: {
      you_factory: 'À toi, côté factory',
      you_answer: 'À toi, une réponse',
      agent: 'À l’agent',
      wait: 'Personne : attendre',
    },
    confidence: { certain: 'certain', likely: 'probable' },
    cause: {
      present: 'Cause toujours là',
      fixed: (time: string) => `Cause corrigée à ${time}`,
      verified: 'vérifiée',
      notDurable: 'pas encore dans le dépôt de la factory',
      durable: 'reportée dans le dépôt',
      unknown: 'État de la cause inconnu',
      none: 'Rien à corriger côté factory',
    },
    advice: {
      now: 'Oui : débloque avec la réponse préremplie.',
      after_fix: 'Non : corrige d’abord la cause, sinon la carte retombera dans le même échec.',
      answer: 'Oui : ta réponse est ce que l’agent attend.',
      wait: 'Inutile : la carte repart seule.',
      not_unblockable: 'Non : cette carte ne se débloque pas depuis l’app, utilise les commandes.',
    },
    nextTriage: 'Si elle rebloque pour la même raison, elle part en triage.',
    setting: {
      observed: 'à l’incident',
      current: 'en service',
      effective: 'effectif',
      repo: 'dépôt',
      unset: (value: string) => `absent (${value} par défaut)`,
      none: 'absent',
    },
    source: {
      kanban: 'Kanban',
      transcript: 'Session',
      webhook: 'Webhook',
      agent_log: 'Journal d’Hermès',
      config: 'Config',
      plugin: 'Plugin',
      workspace: 'Worktree',
    },
    between: (from: string, to: string) => `de ${from} à ${to}`,
    primaryCause: 'cause principale',
    otherFinding: 'autre constat',
    run: (id: number) => `Run #${id}`,
    branch: 'Branche',
    noBranch: 'inconnue',
    commits: { none: 'aucun commit', some: 'commits faits', unknown: 'commits inconnus' },
    commitsRefused: (count: number) => `${count} ${f.plural(count, 'refusé', 'refusés')}`,
    pushed: { yes: 'poussée', no: 'pas poussée', unknown: 'push inconnu' },
    pr: 'PR',
    noPr: 'pas de PR',
    editedFiles: (count: number) =>
      `${count} ${f.plural(count, 'fichier modifié', 'fichiers modifiés')} par l’agent`,
    evidenceFiles: (count: number) =>
      `${count} ${f.plural(count, 'fichier de preuve', 'fichiers de preuve')}`,
    missingSources: (sources: string) =>
      `Sources illisibles : ${sources}. Certaines conclusions ne sont que probables.`,
    sourceName: {
      transcript: 'sessions',
      agentLog: 'journal d’Hermès',
      config: 'config des agents',
      workspace: 'worktree',
    },
    copyCommand: 'Copier',
    copied: 'Copiée',
  },

  agents: {
    title: 'Agents',
    intro: (count: number) =>
      `Les ${count} agents de la factory, avec la configuration réellement en service.`,
    drifting: (count: number) =>
      count > 1
        ? ` ${count} agents diffèrent du dépôt hermes-software-factory.`
        : ` ${count} agent diffère du dépôt hermes-software-factory.`,
    on: 'sur',
    since: 'depuis',
    chain: 'Chaîne de modèles',
    chainTitle: 'Modèles, dans l’ordre des fallbacks',
    effort: (effort: string) => `Effort de raisonnement : ${effort}`,
    drift: 'Dérive de configuration',
    driftTitle: 'En service, différent du dépôt de la factory',
    driftRepo: (repo: string) => ` (dépôt : ${repo})`,
    /** Devant les modèles du dépôt, quand ils s'affichent en badges. */
    driftRepoLabel: 'dépôt',
    field: {
      model: 'modèle',
      baseUrl: 'url du fournisseur',
      fallbacks: 'fallbacks',
      effort: 'effort',
      toolsets: 'toolsets',
      plugins: 'plugins',
      outboundHooks: 'webhooks sortants',
    } satisfies Record<ConfigField, string>,
    /** Un champ que rien ne règle, côté service ou côté dépôt. */
    unset: {
      model: 'aucun',
      baseUrl: 'aucune',
      fallbacks: 'aucun',
      effort: 'défaut',
      toolsets: 'aucun',
      plugins: 'aucun',
      outboundHooks: 'aucun',
    } satisfies Record<ConfigField, string>,
    tools: 'Outils, skills et plugins',
    skills: 'Skills',
    plugins: 'Plugins et refus des gardes (7 jours)',
    refusals: (name: string, count: number) => `${name} · ${count} refus`,
    timeouts: (count: number) =>
      `${count} ${f.plural(count, 'dépassement', 'dépassements')} du hook`,
    risk: (longest: string, limit: string) =>
      `peut lancer des commandes de ${longest}, hook coupé à ${limit}`,
    limits: 'Délais d’Hermès',
    limit: {
      hook_callback_timeout: 'Hook d’un plugin',
      tool_deadline: 'Appel d’outil, hook compris',
      terminal_timeout: 'Commande du terminal',
      max_turns: 'Tours d’un run',
    } satisfies Record<LimitKey, string>,
    limitValue: (value: string, isDefault: boolean) => (isDefault ? `${value} (défaut)` : value),
    turns: (count: number) => `${count} ${f.plural(count, 'tour', 'tours')}`,
    unlimited: 'sans limite',
    toolsets: (mcp: boolean) => (mcp ? 'Toolsets et MCP' : 'Toolsets'),
    runs: 'Runs',
    gatePass: 'Passage en gate',
    notApplicable: 'sans objet',
    medianDuration: 'Durée médiane',
    cost: 'Coût estimé',
  },

  health: {
    title: 'Santé',
    allGood: 'Tous les services répondent.',
    toWatch: (count: number, services: string) =>
      `${count} ${f.plural(count, 'service', 'services')} à surveiller : ${services}.`,
    probeNote:
      'La sonde du gateway passe toutes les 30 s ; le reste vient de ce que les agents observent en travaillant.',
    checked: 'Vérifié',
    groups: {
      hermes: { label: 'Hermès', hint: 'Gateway, dispatcher, pause, dashboard' },
      models: { label: 'Modèles', hint: 'Fournisseurs appelés par les agents' },
      tools: { label: 'Outils', hint: 'MCP et API utilisés par les agents' },
      intake: { label: 'Intake', hint: 'Ce qui fait entrer les issues dans la factory' },
      'factory-live': { label: 'factory-live', hint: 'Les sources de cet outil' },
    } satisfies Record<ServiceHealth['group'], { label: string; hint: string }>,
  },

  costs: {
    title: 'Coûts et quotas',
    intro:
      'Jetons, appels et limites par modèle et par fournisseur, mesurés sur chaque appel des agents.',
    demoNote: 'Chiffres d’exemple de la démo.',
    period: 'Période',
    periods: { 1: '24 h', 7: '7 jours', 30: '30 jours' },
    tokens: 'Jetons',
    calls: 'Appels aux modèles',
    rateLimited: 'Réponses 429',
    cost: 'Coût estimé (abonnement Claude)',
    tokensPerDay: 'Jetons par jour',
    tokensValue: (tokens: string) => `${tokens} jetons`,
    rateLimitedPerDay: 'Réponses 429 par jour',
    rateLimitedValue: (count: number, formatted: string) =>
      `${formatted} ${f.plural(count, 'réponse', 'réponses')} 429`,
    byModel: 'Par modèle',
    columns: {
      model: 'Modèle',
      calls: 'Appels',
      input: 'Entrée',
      output: 'Sortie',
      rateLimited: '429',
      errors: 'Erreurs',
      cost: 'Coût',
    },
    byAgent: 'Jetons par agent',
  },

  history: {
    title: 'Historique et stats',
    intro: (days: number) =>
      `Les ${days} derniers jours. factory-live garde ce qu’Hermès purge après 30 jours.`,
    issuesDone: 'Issues terminées',
    leadTime: 'Délai médian, label → merge',
    blocks: 'Blocages',
    responseTime: 'Ton temps de réponse médian',
    stationTime: 'Temps médian par station',
    gateTitle: 'Passage en gate du premier coup',
    gate: { harness: 'Harnais', model: 'Modèle', runs: 'Runs', rate: 'Taux' },
    agentModel: 'modèle de l’agent',
    tooFew: 'trop peu',
    recentTitle: 'Dernières issues terminées',
    recent: {
      issue: 'Issue',
      outcome: 'Résultat',
      leadTime: 'Délai',
      version: 'Version',
      finishedAt: 'Terminée le',
    },
    outcome: { merged: 'Fusionnée', stopped: 'Arrêtée', closed: 'Fermée' },
    noTag: 'sans tag',
  },

  settings: {
    title: 'Réglages',
    theme: 'Thème',
    themes: { dark: 'Sombre', light: 'Clair', system: 'Système' },
    language: 'Langue',
    githubReturn: {
      installed: 'App GitHub installée : factory-live lit désormais tes dépôts avec elle.',
      connected: 'Connecté à GitHub : tes réponses partiront à ton nom.',
    },
    install: 'Installer l’app',
    installIntro:
      'factory-live est une PWA : elle s’installe depuis le navigateur, sans passer par un store.',
    /** Les deux adresses de l'app : `local` sur ce PC, `tailnet` depuis les autres appareils. */
    installOpen: (local: string, tailnet: string) =>
      `Ouvre ${local} sur ce PC, ${tailnet} sur tes autres appareils du tailnet, puis :`,
    /** Sans adresse tailnet configurée sur le serveur : seulement celle de ce PC. */
    installOpenLocal: (local: string) => `Ouvre ${local} sur ce PC, puis :`,
    installSteps: {
      computer: {
        device: 'Ordinateur',
        text: ' : dans Chrome ou Edge, Installer l’application.',
      },
      android: {
        device: 'Android',
        text: ' : dans Chrome, menu, Installer l’application. Les notifications marchent dès le navigateur.',
      },
      ios: {
        device: 'iPhone ou iPad',
        text: ' : dans Safari, Partager, Sur l’écran d’accueil, puis ouvre l’app pour activer les notifications (iOS 16.4 ou plus).',
      },
    },
    sources: 'Sources',
    /** D'où viennent les données affichées, après les versions en service. */
    dataSource: (demo: boolean) => (demo ? 'données de démonstration' : 'données en direct'),
    /** Quand le serveur est injoignable, au lieu d'afficher une version inventée. */
    unknownServerVersion: 'version du serveur inconnue',
    /** En démo : la version du paquet, pas celle du serveur. */
    demoVersion: 'démo',
  },

  push: {
    title: 'Notifications de cet appareil',
    intro: (kinds: string) =>
      `Un push part seulement quand un blocage t’attend : ${kinds}. Les PR à approuver et la santé restent visibles ici sans notification. Telegram continue en parallèle.`,
    enabled: 'Activées sur cet appareil',
    demoEnabled: ' (démo : rien n’est envoyé)',
    disabled: 'Pas encore activées sur cet appareil',
    enable: 'Activer les notifications',
    test: 'Envoyer un test',
    disable: 'Désactiver',
    previewApp: 'factory-live · maintenant',
    previewTap: 'Touche pour répondre.',
    installFirst:
      'Sur iPhone et iPad, les notifications passent par l’app installée : dans Safari, Partager, Sur l’écran d’accueil, puis ouvre factory-live depuis l’écran d’accueil et reviens ici.',
    unsupported: 'Ce navigateur ne reçoit pas de notifications Web Push.',
    denied:
      'Notifications refusées pour factory-live : réautorise-les dans les réglages de l’appareil, puis reviens ici.',
    reading: 'Lecture de l’abonnement…',
    testSent: 'Test envoyé : la notification arrive dans quelques secondes.',
    disabledDone: 'Notifications désactivées sur cet appareil.',
    enabledDone: 'Notifications activées sur cet appareil.',
  },

  github: {
    title: 'GitHub',
    intro:
      'factory-live lit les issues, les PR et la CI avec sa propre App GitHub, et poste « /factory unblock » à ton nom quand tu débloques une carte.',
    demo: ' Démo : rien n’est envoyé à GitHub.',
    reading: 'Lecture de l’accès GitHub…',
    app: 'App',
    noAppToken: 'Pas encore créée : factory-live lit GitHub avec le jeton de repli',
    noApp: 'Pas encore créée : factory-live ne lit pas encore GitHub',
    create: 'Créer l’App sur GitHub',
    createHelp:
      'GitHub la crée en un clic dans code-my-life, privée et sans webhook. Tu reviens ici pour l’installer.',
    installedOn: ', installée sur ',
    viewOnGitHub: 'Voir sur GitHub',
    created: ' créée, ',
    notInstalled: 'pas encore installée',
    installToCheck: 'installation à vérifier',
    install: 'Installer sur les dépôts',
    installHelp:
      'Choisis « All repositories » : les prochains dépôts de la factory seront couverts sans rien refaire.',
    account: 'Ton compte',
    signedInAs: 'Connecté en tant que',
    tokenHelp: (expiresIn: string) =>
      `Tes réponses partent à ton nom. Jeton renouvelé seul, prochaine échéance dans ${expiresIn}.`,
    logout: 'Se déconnecter',
    notSignedIn: 'Pas connecté : connecte-toi pour débloquer depuis l’app',
    login: 'Se connecter à GitHub',
    loginHelp:
      'Depuis ce PC comme depuis ton smartphone ou ta tablette : GitHub te ramène ici. Seul le compte cddev est accepté.',
  },

  charts: {
    showTable: 'Voir le tableau',
    asTable: (title: string) => `${title}, en tableau`,
    day: 'Jour',
    value: 'Valeur',
  },

  errors: {
    /** Ce qui a échoué, quand le serveur ne dit pas pourquoi. */
    action: {
      unblock: 'Déblocage refusé',
      unblockUnknown: 'Intervention introuvable',
      logout: 'Déconnexion refusée',
      pushDenied:
        'Notifications refusées : autorise-les pour factory-live dans les réglages de l’appareil',
      pushNotAllowed: 'Notifications pas encore autorisées',
      pushKey: 'Notifications indisponibles sur le serveur',
      pushSubscribe: 'Abonnement refusé par factory-live',
      pushUnsubscribe: 'Désabonnement refusé par factory-live',
      pushTest: 'Test refusé par factory-live',
    },
    http: (what: string, status: number) => `${what} (HTTP ${status})`,
    /** Ce que dit l'API quand elle refuse (`ApiError.code`). */
    api: {
      invalid_request: 'Requête invalide',
      not_found: 'Introuvable',
      internal: 'Erreur interne de factory-live',
      intervention_unknown: 'Intervention inconnue ou déjà résolue',
      cause_present:
        'La cause du blocage est toujours là : confirme « Débloquer quand même » pour passer outre',
      unblock_not_available:
        'Cette intervention ne se débloque pas depuis l’app : utilise les commandes proposées',
      github_login_required:
        'Connecte-toi à GitHub dans factory-live (Réglages) pour débloquer depuis l’app',
      github_refused: 'GitHub a refusé le commentaire : réessaie, ou réponds sur l’issue',
      push_unavailable: 'Notifications indisponibles',
      write_login_refused: 'Login Tailscale non autorisé à écrire',
      write_local_only: 'Écriture réservée à ce PC et à ton login Tailscale',
      origin_refused: 'Origine refusée',
      csrf_missing: 'En-tête x-factory-live manquant',
      rate_limited: 'Trop de demandes, réessaie dans une minute',
      host_refused: 'Adresse inconnue de factory-live : ouvre l’app par son adresse habituelle',
    } satisfies Record<ApiErrorCode, string>,
  },

  notification: {
    fallbackBody: 'Un blocage t’attend.',
  },

  blockKind,
  server,
};

/** Les textes sont des chaînes quelconques : seule compte la forme (clés, paramètres des fonctions). */
type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => Widen<R>
    : { [K in keyof T]: Widen<T[K]> };

export type Messages = Widen<typeof fr>;
