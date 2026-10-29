import type {
  AgentState,
  CardKind,
  HealthStatus,
  InterventionKind,
  IssueStatus,
  KanbanStatus,
  ModelRef,
  RunRole,
  ServiceHealth,
  StationId,
} from '@factory-live/contracts';
import { formatters } from '../ui/format.ts';

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
  side: 'Hors ligne',
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
    sidebarFoot: 'Hermès 0.22.2 · board factory',
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
  },

  model: {
    /** Infobulle d'un modèle : « lane : modèle via fournisseur, d'où vient l'information ». */
    description: (prefix: string | null, model: string, provider: string, source: string) =>
      `${prefix ? `${prefix} : ` : ''}${model} via ${provider}, ${source}`,
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
    cardsTitle: 'Cartes de l’issue',
    cardsHint: 'Choisis une carte pour voir ses runs.',
    forcedSkills: (skills: string) => `Skills forcées : ${skills}`,
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
      `Fichiers de preuve de la carte sélectionnée (${cardId ?? 'aucune'}), lus dans son worktree ou dans les preuves archivées par la gate.`,
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
    openedAt: (time: string) => ` · ouverte à ${time}`,
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
    tools: 'Outils, skills et plugins',
    skills: 'Skills',
    plugins: 'Plugins et refus des gardes (7 jours)',
    refusals: (name: string, count: number) => `${name} · ${count} refus`,
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
      provider: 'Fournisseur',
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
    installSteps: {
      iphone: {
        device: 'iPhone',
        text: ' : Safari sur https://desktop-gja56n4.tail40220c.ts.net:8446, Partager, Sur l’écran d’accueil, puis ouvre l’app et active les notifications.',
      },
      pc: {
        device: 'Ce PC',
        text: ' : http://localhost:8446 dans Edge ou Chrome, puis Installer l’application.',
      },
      mac: {
        device: 'Mac ou autre PC du tailnet',
        text: ' : la même adresse que l’iPhone, dans Chrome, Edge ou Safari.',
      },
    },
    sources: 'Sources',
    version: (demo: boolean) =>
      `Version 0.1.0 · ${demo ? 'données de démonstration' : 'données en direct'} · Hermès 0.22.2`,
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
      'Depuis ce PC comme depuis l’iPhone : GitHub te ramène ici. Seul le compte cddev est accepté.',
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
  },

  notification: {
    fallbackBody: 'Un blocage t’attend.',
  },
};

/** Les textes sont des chaînes quelconques : seule compte la forme (clés, paramètres des fonctions). */
type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => Widen<R>
    : { [K in keyof T]: Widen<T[K]> };

export type Messages = Widen<typeof fr>;
