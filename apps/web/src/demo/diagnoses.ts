import { msg } from '@factory-live/contracts';
import type { Diagnosis, EvidenceFile, Finding, RunVerdict } from '@factory-live/contracts';

/*
 * Les diagnostics de la démo, écrits à la main comme le serveur les calcule. La réplique de
 * factory-live#2 reprend l'incident du 2026-10-29 : coder-guard lance format, lint, typecheck et
 * tests dans son hook pre_tool_call au `git commit`, Hermès coupe le hook à 30 s et refuse ensuite
 * tous les outils de l'agent ; le run 189 avait une autre cause (le modèle s'arrête sans appel kanban).
 */

/** Les identifiants réels de l'incident, repris tels quels : l'issue et ses cartes sont publiques. */
export const HOOK_INCIDENT = {
  key: 'factory-live#2',
  brief: 't_fb0bdfe0',
  impl: 't_665ba7d7',
  release: 't_12035a82',
  runs: { model: 189, refused: 190, blocked: 191, after: 192 },
  sessions: {
    model: '20261029_085654_8bd48a',
    refused: '20261029_091353_0a2b3f',
    blocked: '20261029_093652_fc383d',
  },
  branch: 'fix/2-server-version-in-settings',
} as const;

const TIMEOUT_ERROR = '{"error": "pre_tool_call plugin callback timed out or is still running"}';
const HOOK_KEY = 'plugins.hook_callback_timeout';

/** Les heures de l'incident, relatives au lancement du scénario (secondes avant « maintenant »). */
export interface IncidentClock {
  ago: (seconds: number) => string;
}

export function incidentEvidenceFiles({ ago }: IncidentClock): EvidenceFile[] {
  const files: [string, number, number][] = [
    ['01-test-fails-on-base.txt', 2_184, 52],
    ['02-test-passes-on-tip.txt', 1_906, 51],
    ['03-mutation-check.txt', 3_412, 49],
    ['04-full-suite.txt', 6_877, 47],
    ['05-typecheck.txt', 412, 46],
    ['06-build.txt', 1_559, 45],
    ['07-e2e.txt', 18_903, 44],
  ];
  return files.map(([name, bytes, minutes]) => ({ name, bytes, at: ago(minutes * 60) }));
}

function modelStopped({ ago }: IncidentClock): Finding {
  return {
    code: 'stopped_without_kanban_call',
    confidence: 'certain',
    actor: 'wait',
    cause: { state: 'none' },
    summary: msg('diagnosis.summary.stoppedWithoutKanbanCall', { count: 1 }),
    why: msg('diagnosis.why.stoppedWithoutKanbanCall', { nudges: 2 }),
    subject: { profile: 'coder', plugin: null, tool: null },
    setting: null,
    evidence: [
      {
        source: 'agent_log',
        at: ago(57 * 60 + 40),
        until: ago(56 * 60 + 57),
        runId: HOOK_INCIDENT.runs.model,
        fact: msg('diagnosis.evidence.stopNudges', { count: 2 }),
        quote: `kanban stop-loop nudge issued (attempt 2) task=${HOOK_INCIDENT.impl}`,
        count: 2,
      },
      {
        source: 'kanban',
        at: ago(56 * 60),
        until: null,
        runId: HOOK_INCIDENT.runs.model,
        fact: msg('diagnosis.evidence.workerExited'),
        quote: 'Kanban worker tried to exit without a terminal board call',
        count: null,
      },
    ],
    steps: [],
    runIds: [HOOK_INCIDENT.runs.model],
  };
}

/**
 * Le diagnostic de factory-live#2. `fixedAt` : la config de coder a été corrigée (600 s, 420 s
 * effectifs sous le plafond des outils) ; `durable` : la valeur est aussi dans le dépôt de la factory.
 */
export function hookTimeoutDiagnosis(
  clock: IncidentClock,
  fix: { fixedAt: string; durable: boolean } | null = null,
): Diagnosis {
  const { ago } = clock;
  const runs: RunVerdict[] = [
    {
      runId: HOOK_INCIDENT.runs.model,
      finding: 'stopped_without_kanban_call',
      role: 'cause',
      text: msg('diagnosis.run.modelStopped'),
      sessionId: HOOK_INCIDENT.sessions.model,
    },
    {
      runId: HOOK_INCIDENT.runs.refused,
      finding: 'guard_hook_timeout',
      role: 'consequence',
      text: msg('diagnosis.run.refusedThenStopped', { count: 5 }),
      sessionId: HOOK_INCIDENT.sessions.refused,
    },
    {
      runId: HOOK_INCIDENT.runs.blocked,
      finding: 'guard_hook_timeout',
      role: 'consequence',
      text: msg('diagnosis.run.blockedAfterRefusals', { count: 12 }),
      sessionId: HOOK_INCIDENT.sessions.blocked,
    },
  ];
  const primary: Finding = {
    code: 'guard_hook_timeout',
    confidence: 'certain',
    actor: 'you_factory',
    cause: fix
      ? { state: 'fixed', at: fix.fixedAt, verified: false, durable: fix.durable }
      : { state: 'present' },
    summary: msg('diagnosis.summary.guardHookTimeout', { plugin: 'coder-guard', seconds: 30 }),
    why: msg('diagnosis.why.guardHookTimeout', {
      plugin: 'coder-guard',
      trigger: 'git commit',
      seconds: 30,
    }),
    subject: { profile: 'coder', plugin: 'coder-guard', tool: 'terminal' },
    setting: {
      profile: 'coder',
      key: HOOK_KEY,
      unit: 'seconds',
      observed: 30,
      current: fix ? 600 : null,
      defaultValue: 30,
      effective: fix ? 420 : 30,
      repo: fix?.durable ? 600 : null,
    },
    evidence: [
      {
        source: 'transcript',
        at: ago(34 * 60 + 4),
        until: ago(22 * 60 + 52),
        runId: null,
        fact: msg('diagnosis.evidence.toolRefusals', {
          count: 17,
          tools: 'terminal ×12, kanban_request_review ×3, kanban_complete, tool_search',
        }),
        quote: TIMEOUT_ERROR,
        count: 17,
      },
      {
        source: 'agent_log',
        at: ago(34 * 60 + 4),
        until: ago(23 * 60 + 50),
        runId: null,
        fact: msg('diagnosis.evidence.hookTimedOut', { callback: 'pre_tool', seconds: 30 }),
        quote: "Hook 'pre_tool_call' callback pre_tool timed out after 30s",
        count: 2,
      },
      {
        source: 'transcript',
        at: ago(24 * 60 + 20),
        until: null,
        runId: HOOK_INCIDENT.runs.blocked,
        fact: msg('diagnosis.evidence.trigger', { tool: 'terminal' }),
        quote: 'git commit -m "test: SettingsPage version serveur via /healthz en mode live"',
        count: null,
      },
      {
        source: 'plugin',
        at: null,
        until: null,
        runId: null,
        fact: msg('diagnosis.evidence.pluginHook', {
          plugin: 'coder-guard',
          callback: 'pre_tool',
          hook: 'pre_tool_call',
        }),
        quote: 'ctx.register_hook("pre_tool_call", pre_tool)',
        count: null,
      },
      fix
        ? {
            source: 'config',
            at: fix.fixedAt,
            until: null,
            runId: null,
            fact: msg('diagnosis.evidence.settingChanged', { key: HOOK_KEY, value: 600 }),
            quote: 'hook_callback_timeout: 600',
            count: null,
          }
        : {
            source: 'config',
            at: null,
            until: null,
            runId: null,
            fact: msg('diagnosis.evidence.settingMissing', { key: HOOK_KEY, seconds: 30 }),
            quote: null,
            count: null,
          },
      {
        source: 'config',
        at: null,
        until: null,
        runId: null,
        fact: msg('diagnosis.evidence.toolDeadlineCap', { seconds: 420 }),
        quote: null,
        count: null,
      },
    ],
    steps: [
      {
        text: msg('diagnosis.step.setValue', { key: HOOK_KEY, value: 600, profile: 'coder' }),
        command: `hermes -p coder config set ${HOOK_KEY} 600`,
        done: fix !== null,
      },
      {
        text: msg('diagnosis.step.reportInRepo', { path: 'profiles/coder/config.yaml' }),
        command: null,
        done: fix?.durable ?? false,
      },
      { text: msg('diagnosis.step.unblockWithTemplate'), command: null, done: false },
    ],
    runIds: [HOOK_INCIDENT.runs.refused, HOOK_INCIDENT.runs.blocked],
  };
  return {
    computedAt: fix?.fixedAt ?? ago(22 * 60 + 40),
    episode: { from: ago(73 * 60), runIds: runs.map((run) => run.runId) },
    primary,
    others: [modelStopped(clock)],
    unblock: {
      when: fix ? 'now' : 'after_fix',
      template: msg('diagnosis.unblock.hookTimeoutFixed', {
        plugin: 'coder-guard',
        seconds: 30,
        value: 600,
        branch: HOOK_INCIDENT.branch,
        committed: false,
        evidence: 7,
      }),
      nextBlock: 'triage',
    },
    runs,
    work: {
      branch: HOOK_INCIDENT.branch,
      commits: 'none',
      commitsRefused: 2,
      pushed: 'no',
      prUrl: null,
      editedFiles: 10,
      evidence: incidentEvidenceFiles(clock),
    },
    sources: { transcript: true, agentLog: true, config: true, workspace: true },
  };
}

/** Une vraie question de l'agent : aucune cause technique, la réponse de Clément est attendue. */
export function questionDiagnosis({ ago }: IncidentClock, openedSecondsAgo: number): Diagnosis {
  return {
    computedAt: ago(openedSecondsAgo),
    episode: { from: ago(openedSecondsAgo + 9 * 60), runIds: [176] },
    primary: {
      code: 'question',
      confidence: 'certain',
      actor: 'you_answer',
      cause: { state: 'none' },
      summary: msg('diagnosis.summary.question'),
      why: msg('diagnosis.why.question'),
      subject: { profile: 'coordinator', plugin: null, tool: null },
      setting: null,
      evidence: [],
      steps: [{ text: msg('diagnosis.step.answer'), command: null, done: false }],
      runIds: [176],
    },
    others: [],
    unblock: { when: 'answer', template: null, nextBlock: null },
    runs: [],
    work: null,
    sources: { transcript: true, agentLog: true, config: true, workspace: true },
  };
}

/** Carte prête mais retenue par la garde `active_pr` : pas de déblocage, un relais. */
export function heldDiagnosis(
  { ago }: IncidentClock,
  card: string,
  minutes: number,
  relay: string,
): Diagnosis {
  return {
    computedAt: ago(5),
    episode: { from: ago(minutes * 60), runIds: [] },
    primary: {
      code: 'held_active_pr',
      confidence: 'certain',
      actor: 'you_factory',
      cause: { state: 'present' },
      summary: msg('diagnosis.summary.heldActivePr', { minutes }),
      why: msg('diagnosis.why.heldActivePr'),
      subject: { profile: 'coder', plugin: null, tool: null },
      setting: null,
      evidence: [
        {
          source: 'kanban',
          at: ago(minutes * 60),
          until: null,
          runId: null,
          fact: msg('timeline.respawnGuarded.activePr'),
          quote: `respawn_guarded {"reason": "active_pr"} ${card}`,
          count: null,
        },
      ],
      steps: [
        { text: msg('diagnosis.step.relay', { owner: 'coder' }), command: relay, done: false },
      ],
      runIds: [],
    },
    others: [],
    unblock: { when: 'not_unblockable', template: null, nextBlock: null },
    runs: [],
    work: null,
    sources: { transcript: true, agentLog: true, config: true, workspace: true },
  };
}

/** La réponse est postée : l'étape « Débloquer » ou « Répondre » du diagnostic est faite. */
export function answered(diagnosis: Diagnosis | null): Diagnosis | null {
  if (!diagnosis) return null;
  const steps = diagnosis.primary.steps.map((step) =>
    typeof step.text !== 'string' &&
    (step.text.code === 'diagnosis.step.unblockWithTemplate' ||
      step.text.code === 'diagnosis.step.answer')
      ? { ...step, done: true }
      : step,
  );
  return { ...diagnosis, primary: { ...diagnosis.primary, steps } };
}
