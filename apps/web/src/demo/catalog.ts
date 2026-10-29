import type {
  ConfigDrift,
  HistoryStats,
  ModelRef,
  ModelUsage,
  ProfileView,
  ServiceHealth,
  UsageReport,
} from '@factory-live/contracts';
import type { UsagePeriod } from '../data/source.ts';
import { iso } from './state.ts';

/** Modèle local du pilote de coder-claude en service, nom réel (long, utile pour la troncature). */
export const QWEN_LOCAL =
  'Qwen3.5-9B-The-Defiant-Fable-Uncnr-Heretic-plusIQ-TOOLS-NEO-MAX-MTP-Q8_0';
export const NEMOTRON_SUPER = 'nvidia/nemotron-3-super-120b-a12b';
export const NEMOTRON_ULTRA = 'nvidia/nemotron-3-ultra-550b-a55b';

export const model = (
  provider: string,
  name: string,
  source: ModelRef['source'] = 'config',
): ModelRef => ({ provider, model: name, source });

/** Écart de modèle, écrit comme le serveur l'écrit : « modèle (fournisseur) ». */
const driftModel = (live: string, repo = 'agnes-2.5-flash (freellmapi)'): ConfigDrift => ({
  field: 'model',
  live,
  repo,
});
const DRIFT_AUTO = driftModel('auto (freellmapi)');

/** Profils de la factory tels qu'ils tournent aujourd'hui (config en service, 18/10). */
export function buildProfiles(): ProfileView[] {
  return [
    {
      name: 'coordinator',
      role: 'Écrit le brief et le graphe de cartes, relit les diffs. Ne code jamais.',
      station: 'brief',
      modelChain: [
        model('moa', 'mix'),
        model('freellmapi', 'agnes-2.5-flash'),
        model('freellmapi', 'dots3-note-preview'),
        model('nvidia', NEMOTRON_SUPER),
        model('freellmapi', 'auto'),
        model('llamacpp', 'gpt-oss-20b-MXFP4'),
      ],
      effort: 'high',
      toolsets: [
        'kanban',
        'memory',
        'web',
        'clarify',
        'todo',
        'skills',
        'session_search',
        'mcp-graphify',
      ],
      skills: ['factory-brief', 'factory-release', 'impeccable'],
      plugins: [
        { name: 'coordinator-guard', refusals: 2 },
        { name: 'merge-guard', refusals: 0 },
        { name: 'factory-notify', refusals: 0 },
      ],
      mcp: ['graphify'],
      drift: [],
      stats: { runs: 34, gatePassRate: null, medianRunMinutes: 7, costUsd: null },
    },
    {
      name: 'coordinator-claude',
      role: 'Brief des issues labellisées claude : rédigé par claude -p, relu par Hermès.',
      station: 'brief',
      modelChain: [
        model('freellmapi', 'auto'),
        model('freellmapi', 'dots3-note-preview'),
        model('nvidia', NEMOTRON_SUPER),
      ],
      effort: 'low',
      toolsets: [
        'terminal',
        'file',
        'kanban',
        'memory',
        'clarify',
        'todo',
        'skills',
        'mcp-graphify',
      ],
      skills: ['factory-brief', 'factory-release', 'factory-cli-lane', 'impeccable'],
      plugins: [
        { name: 'coordinator-guard', refusals: 0 },
        { name: 'merge-guard', refusals: 0 },
        { name: 'factory-notify', refusals: 0 },
      ],
      mcp: ['graphify'],
      drift: [DRIFT_AUTO],
      stats: { runs: 13, gatePassRate: null, medianRunMinutes: 9, costUsd: 3.4 },
    },
    {
      name: 'coder',
      role: "Implémente une carte avec les outils Hermès : test rouge d'abord, correctif, preuves.",
      station: 'implementation',
      modelChain: [
        model('freellmapi', 'auto'),
        model('freellmapi', 'dots3-note-preview'),
        model('nvidia', NEMOTRON_SUPER),
        model('llamacpp', 'gpt-oss-20b-MXFP4'),
      ],
      effort: 'medium',
      toolsets: [
        'terminal',
        'file',
        'browser',
        'kanban',
        'memory',
        'web',
        'clarify',
        'todo',
        'skills',
        'session_search',
        'mcp-graphify',
      ],
      skills: ['factory-author-proof', 'impeccable'],
      plugins: [
        { name: 'coder-guard', refusals: 7 },
        { name: 'factory-notify', refusals: 0 },
      ],
      mcp: ['graphify'],
      drift: [DRIFT_AUTO],
      stats: { runs: 52, gatePassRate: 0.58, medianRunMinutes: 24, costUsd: null },
    },
    {
      name: 'coder-claude',
      role: "Même contrat que coder, implémentation déléguée à Claude Code (claude -p) sur l'abonnement.",
      station: 'implementation',
      modelChain: [
        model('llamacpp', QWEN_LOCAL),
        model('freellmapi', 'dots3-note-preview'),
        model('nvidia', NEMOTRON_SUPER),
        model('freellmapi', 'auto'),
      ],
      effort: 'low',
      toolsets: ['terminal', 'file', 'kanban', 'memory', 'clarify', 'todo', 'skills'],
      skills: ['factory-author-proof', 'factory-cli-lane', 'impeccable'],
      plugins: [
        { name: 'coder-guard', refusals: 3 },
        { name: 'factory-notify', refusals: 0 },
      ],
      mcp: [],
      drift: [driftModel(`${QWEN_LOCAL} (llamacpp)`)],
      stats: { runs: 21, gatePassRate: 0.81, medianRunMinutes: 31, costUsd: 18.62 },
    },
    {
      name: 'coder-opencode',
      role: 'Même contrat que coder, implémentation déléguée à OpenCode sur freellmapi.',
      station: 'implementation',
      modelChain: [
        model('nvidia', NEMOTRON_ULTRA),
        model('freellmapi', 'dots3-note-preview'),
        model('nvidia', NEMOTRON_SUPER),
      ],
      effort: 'low',
      toolsets: ['terminal', 'file', 'kanban', 'memory', 'clarify', 'todo', 'skills'],
      skills: ['factory-author-proof', 'factory-cli-lane', 'impeccable'],
      plugins: [
        { name: 'coder-guard', refusals: 0 },
        { name: 'factory-notify', refusals: 0 },
      ],
      mcp: [],
      drift: [driftModel(`${NEMOTRON_ULTRA} (nvidia)`)],
      stats: { runs: 1, gatePassRate: null, medianRunMinutes: null, costUsd: null },
    },
    {
      name: 'gate',
      role: "Vérificateur indépendant : build, suite complète, CI verte exigée. N'édite jamais le code.",
      station: 'gate',
      modelChain: [
        model('nvidia', NEMOTRON_SUPER),
        model('freellmapi', 'agnes-2.5-flash'),
        model('freellmapi', 'dots3-note-preview'),
        model('freellmapi', 'auto'),
        model('llamacpp', 'gpt-oss-20b-MXFP4'),
      ],
      effort: 'high',
      toolsets: [
        'terminal',
        'file',
        'browser',
        'kanban',
        'memory',
        'clarify',
        'todo',
        'skills',
        'mcp-graphify',
      ],
      skills: ['factory-gate', 'impeccable'],
      plugins: [
        { name: 'gate-readonly', refusals: 4 },
        { name: 'factory-notify', refusals: 0 },
      ],
      mcp: ['graphify'],
      drift: [],
      stats: { runs: 49, gatePassRate: null, medianRunMinutes: 18, costUsd: null },
    },
    {
      name: 'gate-claude',
      role: 'Gate des issues labellisées claude : verdict rendu par claude -p, vérifié par gate-readonly.',
      station: 'gate',
      modelChain: [
        model('freellmapi', 'auto'),
        model('freellmapi', 'dots3-note-preview'),
        model('nvidia', NEMOTRON_SUPER),
      ],
      effort: 'low',
      toolsets: [
        'terminal',
        'file',
        'browser',
        'kanban',
        'memory',
        'clarify',
        'todo',
        'skills',
        'mcp-graphify',
      ],
      skills: ['factory-gate', 'factory-cli-lane', 'impeccable'],
      plugins: [
        { name: 'gate-readonly', refusals: 1 },
        { name: 'factory-notify', refusals: 0 },
      ],
      mcp: ['graphify'],
      drift: [DRIFT_AUTO],
      stats: { runs: 15, gatePassRate: null, medianRunMinutes: 22, costUsd: 9.8 },
    },
    {
      name: 'scribe',
      role: 'Tâches mécaniques : docs, résumés de logs, relais de cartes.',
      station: 'implementation',
      modelChain: [model('freellmapi', 'auto'), model('llamacpp', 'Qwen3.5-9B-Q4_K_M')],
      effort: 'low',
      toolsets: ['terminal', 'file', 'kanban', 'memory', 'clarify', 'todo', 'skills'],
      skills: ['factory-author-proof'],
      plugins: [
        { name: 'coder-guard', refusals: 0 },
        { name: 'factory-notify', refusals: 0 },
      ],
      mcp: [],
      drift: [DRIFT_AUTO],
      stats: { runs: 5, gatePassRate: null, medianRunMinutes: 3, costUsd: null },
    },
    {
      name: 'release',
      role: 'Merge après ton approbation, tag, surveillance des workflows de main.',
      station: 'release',
      modelChain: [model('freellmapi', 'auto'), model('llamacpp', 'gpt-oss-20b-MXFP4')],
      effort: 'medium',
      toolsets: ['terminal', 'file', 'kanban', 'memory', 'web', 'clarify', 'todo', 'skills'],
      skills: ['factory-release'],
      plugins: [
        { name: 'merge-guard', refusals: 1 },
        { name: 'factory-notify', refusals: 0 },
      ],
      mcp: [],
      drift: [DRIFT_AUTO],
      stats: { runs: 0, gatePassRate: null, medianRunMinutes: null, costUsd: null },
    },
    {
      name: 'tool-setup',
      role: "Onboarding d'un dépôt : projet Hermès, AGENTS.md, outils vérifiés.",
      station: 'side',
      modelChain: [model('freellmapi', 'auto')],
      effort: null,
      toolsets: ['terminal', 'file', 'kanban', 'memory', 'skills'],
      skills: ['factory-onboard'],
      plugins: [{ name: 'factory-notify', refusals: 0 }],
      mcp: [],
      // tool-setup est volontairement hors distribution (install.sh le configure) : pas de dérive à montrer.
      drift: [],
      stats: { runs: 6, gatePassRate: null, medianRunMinutes: 11, costUsd: null },
    },
  ];
}

function usageRow(
  name: string,
  provider: string,
  calls: number,
  inputTokens: number,
  outputTokens: number,
  costUsd: number | null,
  rateLimited: number,
  errors: number,
): ModelUsage {
  return { model: name, provider, calls, inputTokens, outputTokens, costUsd, rateLimited, errors };
}

const CLAUDE_NOTE =
  "Abonnement Claude : coût estimé par Claude Code, pas un débit réel. Le solde des fenêtres de 5 h et de la semaine n'a pas de source fiable ; il s'affiche seulement quand une transcription signale une limite.";

/** Chiffres d'exemple, proportionnés sur la période. */
export function buildUsage(now: number): Record<UsagePeriod, UsageReport> {
  const base: ModelUsage[] = [
    usageRow('agnes-2.5-flash', 'freellmapi', 1840, 9_200_000, 410_000, null, 37, 4),
    usageRow('claude-opus-5-5', 'anthropic', 312, 5_600_000, 210_000, 18.62, 0, 0),
    usageRow(NEMOTRON_SUPER, 'nvidia', 610, 3_400_000, 140_000, null, 0, 2),
    usageRow('dots3-note-preview', 'freellmapi', 420, 2_100_000, 96_000, null, 6, 1),
    usageRow('claude-sonnet-5-5', 'anthropic', 140, 2_000_000, 80_000, 4.1, 0, 0),
    usageRow('mix', 'moa', 74, 1_100_000, 52_000, null, 0, 0),
    usageRow(QWEN_LOCAL, 'llamacpp', 96, 410_000, 31_000, null, 0, 0),
    usageRow('gpt-oss-20b-MXFP4', 'llamacpp', 3, 18_000, 2_000, null, 0, 1),
  ];
  const scale = (factor: number): ModelUsage[] =>
    base.map((row) => ({
      ...row,
      calls: Math.round(row.calls * factor),
      inputTokens: Math.round(row.inputTokens * factor),
      outputTokens: Math.round(row.outputTokens * factor),
      costUsd: row.costUsd === null ? null : Math.round(row.costUsd * factor * 100) / 100,
      rateLimited: Math.round(row.rateLimited * factor),
      errors: Math.round(row.errors * factor),
    }));
  const daily = (days: number) =>
    Array.from({ length: days }, (_, index) => {
      const day = iso(now - (days - 1 - index) * 86_400_000).slice(0, 10);
      const wave = [0.6, 1.3, 0.9, 1.6, 0.4, 0.2, 1.1][index % 7] ?? 1;
      return {
        day,
        tokens: Math.round(3_400_000 * wave),
        rateLimited: Math.round(6 * wave),
      };
    });
  const byProfile = [
    { profile: 'coder', tokens: 8_600_000 },
    { profile: 'coder-claude', tokens: 6_100_000 },
    { profile: 'gate', tokens: 3_500_000 },
    { profile: 'gate-claude', tokens: 2_400_000 },
    { profile: 'coordinator', tokens: 1_200_000 },
    { profile: 'coordinator-claude', tokens: 900_000 },
    { profile: 'scribe', tokens: 60_000 },
  ];
  return {
    1: {
      periodDays: 1,
      models: scale(0.16),
      byProfile: byProfile.map((row) => ({ ...row, tokens: Math.round(row.tokens * 0.16) })),
      daily: daily(1),
      claudeSubscriptionNote: CLAUDE_NOTE,
    },
    7: {
      periodDays: 7,
      models: base,
      byProfile,
      daily: daily(7),
      claudeSubscriptionNote: CLAUDE_NOTE,
    },
    30: {
      periodDays: 30,
      models: scale(3.4),
      byProfile: byProfile.map((row) => ({ ...row, tokens: Math.round(row.tokens * 3.4) })),
      daily: daily(30),
      claudeSubscriptionNote: CLAUDE_NOTE,
    },
  };
}

export function buildHistory(now: number): HistoryStats {
  const day = 86_400_000;
  return {
    periodDays: 14,
    issuesDone: 9,
    medianLeadTimeMinutes: 212,
    stationMinutes: [
      { station: 'intake', medianMinutes: 1 },
      { station: 'brief', medianMinutes: 8 },
      { station: 'implementation', medianMinutes: 74 },
      { station: 'gate', medianMinutes: 26 },
      { station: 'release', medianMinutes: 95 },
    ],
    gatePassRate: [
      { harness: 'coder-claude', model: 'claude-opus-5-5', runs: 16, rate: 0.81 },
      { harness: 'coder-claude', model: 'claude-sonnet-5-5', runs: 4, rate: 0.75 },
      // Sans lane Claude, le serveur n'a pas de modèle à donner : c'est celui de l'agent (`null`).
      { harness: 'coder', model: null, runs: 24, rate: 0.58 },
      { harness: 'coder-opencode', model: null, runs: 1, rate: 0 },
    ],
    blocks: 7,
    medianHumanResponseMinutes: 18,
    recent: [
      {
        key: 'claude-cockpit#42',
        title: 'E2E PR 2b : île et lanceur',
        outcome: 'merged',
        leadTimeMinutes: 1460,
        finishedAt: iso(now - 8 * day),
        version: 'v0.12.0',
      },
      {
        key: 'claude-cockpit#52',
        title: "Île : le bouton Détails chevauche l'encart d'autorisation",
        outcome: 'merged',
        leadTimeMinutes: 188,
        finishedAt: iso(now - 8 * day - 3_600_000),
        version: 'v0.11.3',
      },
      {
        key: 'claude-cockpit#18',
        title: 'Résumés de conversation tronqués dans la carte',
        outcome: 'merged',
        leadTimeMinutes: 241,
        finishedAt: iso(now - 9 * day),
        version: 'v0.11.2',
      },
      {
        key: 'cv-site#46',
        title: 'CODEOWNERS sur main',
        outcome: 'merged',
        leadTimeMinutes: 96,
        finishedAt: iso(now - 11 * day),
        version: null,
      },
      {
        key: 'claude-cockpit#25',
        title: 'Push refusé : jeton de la GitHub App expiré',
        outcome: 'stopped',
        leadTimeMinutes: 520,
        finishedAt: iso(now - 12 * day),
        version: null,
      },
      {
        key: 'claude-cockpit#14',
        title: 'Vue ÉQUIPE : afficher des cartes, pas des lignes',
        outcome: 'merged',
        leadTimeMinutes: 133,
        finishedAt: iso(now - 12 * day - 7_200_000),
        version: 'v0.10.1',
      },
    ],
  };
}

export function buildHealth(now: number): ServiceHealth[] {
  const ago = (seconds: number) => iso(now - seconds * 1000);
  return [
    {
      id: 'gateway',
      label: 'Gateway Hermès',
      group: 'hermes',
      status: 'ok',
      detail: 'En marche depuis 6 h 12, battement il y a 9 s',
      checkedAt: ago(9),
      metrics: [
        { label: 'Version', value: '0.22.2' },
        { label: 'Mode', value: 'multiplex' },
      ],
    },
    {
      id: 'dispatcher',
      label: 'Dispatcher kanban',
      group: 'hermes',
      status: 'ok',
      detail: 'Dernier tick il y a 12 s',
      checkedAt: ago(12),
      metrics: [
        { label: 'En cours', value: '2 sur 2' },
        { label: 'Par agent', value: '1 au plus' },
      ],
    },
    {
      id: 'pause',
      label: 'Pause (ESTOP)',
      group: 'hermes',
      status: 'ok',
      detail: 'Factory active, aucune pause posée',
      checkedAt: ago(8),
      metrics: [],
    },
    {
      id: 'dashboard',
      label: 'Dashboard Hermès',
      group: 'hermes',
      status: 'ok',
      detail: 'Répond sur 9119 (tailnet : 8443)',
      checkedAt: ago(8),
      metrics: [],
    },
    {
      id: 'freellmapi',
      label: 'freellmapi',
      group: 'models',
      status: 'ok',
      detail: 'Routeur joignable, 14 modèles',
      checkedAt: ago(20),
      metrics: [{ label: '429 sur 10 min', value: '0' }],
    },
    {
      id: 'nvidia',
      label: 'API NVIDIA',
      group: 'models',
      status: 'ok',
      detail: 'Dernier appel réussi il y a 31 s',
      checkedAt: ago(31),
      metrics: [],
    },
    {
      id: 'llamacpp',
      label: 'llama.cpp local',
      group: 'models',
      status: 'ok',
      detail: `1 modèle chargé : ${QWEN_LOCAL}`,
      checkedAt: ago(8),
      metrics: [{ label: 'VRAM', value: '9,8 sur 16 Go' }],
    },
    {
      id: 'claude',
      label: 'Claude Code (abonnement)',
      group: 'models',
      status: 'ok',
      detail: 'Dernière session il y a 40 s, aucune limite signalée',
      checkedAt: ago(40),
      metrics: [],
    },
    {
      id: 'graphify',
      label: 'MCP graphify',
      group: 'tools',
      status: 'ok',
      detail: 'Répond sur 8081',
      checkedAt: ago(8),
      metrics: [],
    },
    {
      id: 'github',
      label: 'API GitHub',
      group: 'tools',
      status: 'ok',
      detail: 'Jeton fine-grained de cddev valide',
      checkedAt: ago(14),
      metrics: [{ label: 'Quota restant', value: '4 812 sur 5 000' }],
    },
    {
      id: 'webhook',
      label: 'Webhooks GitHub',
      group: 'intake',
      status: 'ok',
      detail: 'Dernière livraison acceptée (200) il y a 3 min',
      checkedAt: ago(180),
      metrics: [],
    },
    {
      id: 'funnel',
      label: 'Tailscale Funnel',
      group: 'intake',
      status: 'ok',
      detail: 'Funnel actif sur 443 vers le webhook 8644',
      checkedAt: ago(110),
      metrics: [],
    },
    {
      id: 'cron',
      label: 'Tâches cron',
      group: 'intake',
      status: 'ok',
      detail: 'intake 4 min, watch 21 min, jeton de l’App 32 min : tout est vert',
      checkedAt: ago(240),
      metrics: [],
    },
    {
      id: 'probe',
      label: 'Sonde factory-live-probe',
      group: 'factory-live',
      status: 'ok',
      detail: 'Dernier rapport il y a 8 s',
      checkedAt: ago(8),
      metrics: [],
    },
    {
      id: 'sources',
      label: 'Sources de factory-live',
      group: 'factory-live',
      status: 'ok',
      detail: 'kanban.db lu il y a 0,3 s, webhooks reçus : 46 par minute',
      checkedAt: ago(1),
      metrics: [],
    },
  ];
}
