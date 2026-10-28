import type {
  AgentState,
  CardKind,
  InterventionKind,
  IssueStatus,
  KanbanStatus,
  RunRole,
  StationId,
} from '@factory-live/contracts';

/** Le vocabulaire de la factory, tel qu'il apparaît dans ses docs et sur les issues. */
export const STATION_LABEL: Record<StationId, string> = {
  intake: 'Intake',
  brief: 'Brief',
  implementation: 'Implémentation',
  gate: 'Gate',
  release: 'Release',
  done: 'Terminé',
  stopped: 'Arrêté',
  side: 'Hors ligne',
};

export const STATION_HINT: Record<StationId, string> = {
  intake: 'Issue labellisée factory, carte créée',
  brief: 'Le coordinateur écrit le brief et le graphe de cartes',
  implementation: 'Test qui échoue, correctif, preuves, PR en brouillon',
  gate: 'Vérification indépendante, CI verte exigée',
  release: 'Ton approbation, merge, tag, CI de main',
  done: 'Mergé, workflows de main verts',
  stopped: 'Arrêté ou PR fermée',
  side: 'Triage, watch, onboarding',
};

export const LINE_STATIONS: readonly StationId[] = [
  'intake',
  'brief',
  'implementation',
  'gate',
  'release',
  'done',
];

export const AGENT_STATE_LABEL: Record<AgentState, string> = {
  idle: 'Au repos',
  queued: 'En file',
  thinking: 'Réfléchit',
  tool: 'Outil',
  cli: 'Lane CLI',
  blocked: 'Bloqué',
};

export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  active: 'En cours',
  queued: 'En file',
  waiting_human: 'Attend ta décision',
  blocked: 'Bloquée',
  done: 'Terminée',
  stopped: 'Arrêtée',
};

export const INTERVENTION_LABEL: Record<InterventionKind, string> = {
  needs_input: 'Décision attendue',
  capability: 'Outil ou accès manquant',
  transient: 'Échec passager',
  gave_up: 'Abandon',
  triage_loop: 'Boucle de blocage',
  held_active_pr: 'Carte retenue',
  pr_approval: 'PR à approuver',
  main_red: 'Main rouge',
  service_down: 'Service en panne',
};

/** Ce qu'on fait d'une intervention, depuis la boîte de l'issue sur la ligne d'usine. */
export const INTERVENTION_ACTION_LABEL: Record<InterventionKind, string> = {
  needs_input: 'Répondre',
  capability: 'Répondre',
  transient: 'Débloquer',
  gave_up: 'Débloquer',
  triage_loop: 'Voir la procédure',
  held_active_pr: 'Voir les commandes',
  pr_approval: 'Approuver la PR',
  main_red: 'Voir les runs',
  service_down: 'Voir la santé',
};

export const PROVIDER_LABEL: Record<string, string> = {
  freellmapi: 'freellmapi',
  nvidia: 'NVIDIA',
  llamacpp: 'llama.cpp',
  moa: 'MoA',
  anthropic: 'Claude',
  'claude-code': 'Claude',
};

export function providerLabel(provider: string): string {
  return PROVIDER_LABEL[provider] ?? provider;
}

export const CARD_KIND_LABEL: Record<CardKind, string> = {
  brief: 'Brief',
  impl: 'Implémentation',
  release: 'Release',
  diagnostic: 'Diagnostic',
  watch: 'Surveillance',
  onboarding: 'Onboarding',
  other: 'Autre',
};

export const CARD_STATUS_LABEL: Record<KanbanStatus, string> = {
  triage: 'Triage',
  todo: 'En attente',
  scheduled: 'Planifiée',
  ready: 'Prête',
  running: 'En cours',
  blocked: 'Bloquée',
  review: 'En revue',
  done: 'Terminée',
  archived: 'Archivée',
};

export const RUN_ROLE_LABEL: Record<RunRole, string> = {
  coordinator: 'coordination',
  implementer: 'implémentation',
  reviewer: 'revue',
  release: 'release',
  other: 'autre',
};
