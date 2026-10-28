import type { ActivityEvent } from '@factory-live/contracts';
import { NEMOTRON_SUPER, QWEN_LOCAL, model } from './catalog.ts';
import { CARDS, KEYS, RUNS, prUrl } from './initial.ts';
import {
  addCost,
  addRun,
  addTimeline,
  appendTranscript,
  iso,
  openIntervention,
  patchAgent,
  patchCard,
  patchHealth,
  patchIssue,
  patchRun,
  pushActivity,
} from './state.ts';
import type { DemoState } from './state.ts';

export interface ScenarioStep {
  /** Secondes depuis le lancement du scénario. */
  at: number;
  run: (state: DemoState, now: number) => void;
}

type ToolStep = {
  tool: string;
  detail: string;
  status: ActivityEvent['status'];
  durationMs: number | null;
};

function activity(
  state: DemoState,
  now: number,
  event: Partial<ActivityEvent> & Pick<ActivityEvent, 'kind' | 'label'>,
): void {
  pushActivity(state, {
    at: iso(now),
    profile: null,
    issueKey: null,
    cardId: null,
    detail: null,
    status: null,
    durationMs: null,
    model: null,
    ...event,
  });
}

const CLAUDE_LANE: ToolStep[] = [
  { tool: 'Edit', detail: 'desktop/src/team/groupByProject.ts', status: 'ok', durationMs: 900 },
  { tool: 'Bash', detail: 'npm test -- team', status: 'ok', durationMs: 8_700 },
  { tool: 'Read', detail: 'desktop/src/team/TeamCard.tsx', status: 'ok', durationMs: 300 },
  { tool: 'Edit', detail: 'desktop/src/team/TeamView.tsx', status: 'ok', durationMs: 1_100 },
  { tool: 'Edit', detail: 'desktop/test/team.test.js', status: 'ok', durationMs: 800 },
  { tool: 'Bash', detail: 'npm run typecheck:mod', status: 'ok', durationMs: 12_400 },
  { tool: 'Bash', detail: 'npm test', status: 'ok', durationMs: 31_200 },
  { tool: 'Bash', detail: 'git diff --stat', status: 'ok', durationMs: 200 },
];

const GATE_CONTACT: ToolStep[] = [
  { tool: 'terminal', detail: 'pnpm -r test : 34 réussis', status: 'ok', durationMs: 33_800 },
  {
    tool: 'terminal',
    detail: 'docker run --network none cv-site-build',
    status: 'ok',
    durationMs: 48_100,
  },
  { tool: 'mcp_graphify_get_pr_impact', detail: 'PR #52', status: 'ok', durationMs: 2_300 },
  { tool: 'terminal', detail: 'gh pr checks 52 --watch', status: 'ok', durationMs: 6_400 },
  {
    tool: 'terminal',
    detail: 'gh pr review 52 --comment --body-file evidence/gate/1/review.md',
    status: 'ok',
    durationMs: 1_900,
  },
];

const CODER_SHORTCUT: ToolStep[] = [
  { tool: 'read_file', detail: 'desktop/src/island/QuickReply.tsx', status: 'ok', durationMs: 200 },
  {
    tool: 'terminal',
    detail: 'npm test -- quick-reply (rouge sur la base, attendu)',
    status: 'error',
    durationMs: 7_800,
  },
  { tool: 'patch', detail: 'desktop/src/island/QuickReply.tsx', status: 'ok', durationMs: 400 },
  { tool: 'patch', detail: 'desktop/src/shortcuts.ts', status: 'ok', durationMs: 300 },
  { tool: 'terminal', detail: 'npm test -- quick-reply', status: 'ok', durationMs: 7_100 },
  { tool: 'terminal', detail: 'npm run typecheck:mod', status: 'ok', durationMs: 12_000 },
];

const GATE_TEAM: ToolStep[] = [
  { tool: 'terminal', detail: 'npm ci', status: 'ok', durationMs: 38_000 },
  { tool: 'terminal', detail: 'npm test', status: 'ok', durationMs: 30_400 },
  { tool: 'terminal', detail: 'xvfb-run -a npm run test:e2e', status: 'ok', durationMs: 52_000 },
  {
    tool: 'terminal',
    detail: 'claude -p (verdict, claude-opus-5-5)',
    status: 'running',
    durationMs: null,
  },
];

function toolLoop(
  steps: ToolStep[],
  from: number,
  every: number,
  until: number,
  apply: (state: DemoState, now: number, step: ToolStep) => void,
): ScenarioStep[] {
  const result: ScenarioStep[] = [];
  let index = 0;
  for (let at = from; at <= until; at += every) {
    const step = steps[index % steps.length];
    index += 1;
    if (step) result.push({ at, run: (state, now) => apply(state, now, step) });
  }
  return result;
}

function claudeLaneStep(state: DemoState, now: number, step: ToolStep): void {
  patchAgent(state, 'coder-claude', {
    state: 'cli',
    action: {
      kind: 'cli',
      label: `claude -p · ${step.tool}`,
      detail: step.detail,
      startedAt: iso(now),
    },
    lastHeartbeatAt: iso(now),
  });
  activity(state, now, {
    kind: 'tool',
    profile: 'coder-claude',
    issueKey: KEYS.team,
    cardId: CARDS.teamImpl,
    label: step.tool,
    detail: step.detail,
    status: step.status,
    durationMs: step.durationMs,
    model: 'claude-opus-5-5',
  });
  appendTranscript(state, RUNS.teamImpl, 'claude-code', {
    at: iso(now),
    role: 'tool_call',
    text: step.detail,
    toolName: step.tool,
    model: null,
    status: null,
  });
  addCost(state, KEYS.team, 9_000, 0.04);
}

function gateContactStep(state: DemoState, now: number, step: ToolStep): void {
  patchAgent(state, 'gate', {
    state: 'tool',
    action: { kind: 'tool', label: step.tool, detail: step.detail, startedAt: iso(now) },
    lastHeartbeatAt: iso(now),
  });
  activity(state, now, {
    kind: 'tool',
    profile: 'gate',
    issueKey: KEYS.contact,
    cardId: CARDS.contactImpl,
    label: step.tool,
    detail: step.detail,
    status: step.status,
    durationMs: step.durationMs,
    model: NEMOTRON_SUPER,
  });
  appendTranscript(
    state,
    RUNS.contactGate,
    'hermes',
    {
      at: iso(now),
      role: 'tool_call',
      text: step.detail,
      toolName: step.tool,
      model: null,
      status: null,
    },
    `\u001b[36m  ${step.tool}\u001b[0m ${step.detail}`,
  );
}

function coderShortcutStep(state: DemoState, now: number, step: ToolStep): void {
  patchAgent(state, 'coder', {
    state: 'tool',
    action: { kind: 'tool', label: step.tool, detail: step.detail, startedAt: iso(now) },
    lastHeartbeatAt: iso(now),
  });
  activity(state, now, {
    kind: 'tool',
    profile: 'coder',
    issueKey: KEYS.shortcut,
    cardId: CARDS.shortcutImpl,
    label: step.tool,
    detail: step.detail,
    status: step.status,
    durationMs: step.durationMs,
    model: 'dots3-note-preview',
  });
}

function gateTeamStep(state: DemoState, now: number, step: ToolStep): void {
  const isLane = step.detail.startsWith('claude -p');
  patchAgent(state, 'gate-claude', {
    state: isLane ? 'cli' : 'tool',
    laneModel: isLane ? model('anthropic', 'claude-opus-5-5', 'live') : null,
    action: {
      kind: isLane ? 'cli' : 'tool',
      label: step.tool,
      detail: step.detail,
      startedAt: iso(now),
    },
    lastHeartbeatAt: iso(now),
  });
  activity(state, now, {
    kind: 'tool',
    profile: 'gate-claude',
    issueKey: KEYS.team,
    cardId: CARDS.teamImpl,
    label: step.tool,
    detail: step.detail,
    status: step.status,
    durationMs: step.durationMs,
    model: isLane ? 'claude-opus-5-5' : 'agnes-2.5-flash',
  });
}

/** Le déroulé de la démo, en secondes depuis le lancement. */
export function buildScript(): ScenarioStep[] {
  const steps: ScenarioStep[] = [
    ...toolLoop(CLAUDE_LANE, 3, 4, 36, claudeLaneStep),
    ...toolLoop(GATE_CONTACT, 4, 5, 20, gateContactStep),
    {
      at: 14,
      run: (state, now) => {
        patchCard(state, KEYS.team, CARDS.teamImpl, { testsPassed: 12 });
        appendTranscript(state, RUNS.teamImpl, 'claude-code', {
          at: iso(now),
          role: 'tool_result',
          text: '12 passing, 1 failing',
          toolName: 'Bash',
          model: null,
          status: 'error',
        });
      },
    },
    {
      at: 30,
      run: (state, now) => {
        patchCard(state, KEYS.team, CARDS.teamImpl, { testsPassed: 13 });
        appendTranscript(state, RUNS.teamImpl, 'claude-code', {
          at: iso(now),
          role: 'assistant',
          text: '13 tests passent. Les groupes sont triés avec localeCompare(fr) et les cartes sans projet restent à la fin.',
          toolName: null,
          model: 'claude-opus-5-5',
          status: null,
        });
      },
    },
    {
      at: 24,
      run: (state, now) => {
        patchCard(state, KEYS.contact, CARDS.contactImpl, { status: 'done' });
        patchRun(state, KEYS.contact, CARDS.contactImpl, RUNS.contactGate, {
          status: 'done',
          outcome: 'completed',
          endedAt: iso(now),
          summary: 'Approuvé : 34 tests, build hors ligne vert, checks de la PR verts',
        });
        patchCard(state, KEYS.contact, CARDS.contactRelease, {
          status: 'blocked',
          blockKind: 'needs_input',
        });
        const pr = state.details[KEYS.contact]?.issue.pr;
        patchIssue(state, KEYS.contact, {
          station: 'release',
          status: 'waiting_human',
          activeProfiles: [],
          updatedAt: iso(now),
          pr: pr
            ? { ...pr, state: 'open', checks: 'success', reviewDecision: 'review_required' }
            : null,
        });
        patchAgent(state, 'gate', {
          state: 'idle',
          cardId: null,
          issueKey: null,
          action: null,
          runStartedAt: null,
        });
        addTimeline(state, KEYS.contact, {
          at: iso(now),
          source: 'kanban',
          profile: 'gate',
          cardId: CARDS.contactImpl,
          label: 'Gate : approuvé',
          detail: '34 tests, build hors ligne vert, checks de la PR verts',
          tone: 'success',
        });
        addTimeline(state, KEYS.contact, {
          at: iso(now),
          source: 'github',
          profile: null,
          cardId: null,
          label: 'PR #52 prête, revue demandée à @cddev',
          detail:
            "Dépôt privé : pas d'auto-merge, l’agent release fusionnera après ton approbation",
          tone: 'neutral',
        });
        openIntervention(state, {
          id: 'iv-contact',
          kind: 'pr_approval',
          severity: 'info',
          title: 'PR #52 prête à approuver',
          issueKey: KEYS.contact,
          cardId: CARDS.contactRelease,
          profile: 'coordinator',
          question:
            "La gate a approuvé la PR #52 : 34 tests, build hors ligne vert, checks verts. cv-site est privé, donc pas d'auto-merge : après ton approbation, l’agent release fusionne puis surveille main.",
          openedAt: iso(now),
          push: false,
          actions: [
            { kind: 'link', label: 'Approuver la PR #52 sur GitHub', url: prUrl('cv-site', 52) },
          ],
          unblock: null,
        });
        activity(state, now, {
          kind: 'kanban',
          profile: 'gate',
          issueKey: KEYS.contact,
          cardId: CARDS.contactImpl,
          label: 'Gate : approuvé',
          detail: 'PR #52 prête pour ta revue',
          status: 'ok',
        });
        state.snapshot.factory.running = 1;
      },
    },
    {
      at: 27,
      run: (state, now) => {
        patchAgent(state, 'coordinator', {
          state: 'thinking',
          model: model('moa', 'mix', 'live'),
          action: {
            kind: 'llm',
            label: 'Appel au modèle',
            detail: 'mix : références fusion et auto, agrégateur nemotron-3-ultra-550b',
            startedAt: iso(now),
          },
          runStartedAt: iso(now),
          lastHeartbeatAt: iso(now),
        });
        patchCard(state, KEYS.shortcut, CARDS.shortcutBrief, { status: 'running' });
        addRun(state, KEYS.shortcut, CARDS.shortcutBrief, {
          id: 185,
          profile: 'coordinator',
          role: 'coordinator',
          status: 'running',
          outcome: null,
          startedAt: iso(now),
          endedAt: null,
          model: model('moa', 'mix', 'live'),
          laneModel: null,
          summary: null,
          tokens: null,
          costUsd: null,
        });
        patchIssue(state, KEYS.shortcut, {
          status: 'active',
          activeProfiles: ['coordinator'],
          updatedAt: iso(now),
        });
        addTimeline(state, KEYS.shortcut, {
          at: iso(now),
          source: 'kanban',
          profile: 'coordinator',
          cardId: CARDS.shortcutBrief,
          label: 'coordinator prend le brief (une place libérée)',
          detail: null,
          tone: 'neutral',
        });
        activity(state, now, {
          kind: 'kanban',
          profile: 'coordinator',
          issueKey: KEYS.shortcut,
          cardId: CARDS.shortcutBrief,
          label: 'claimed',
          detail: 'Le dispatcher lance coordinator sur le brief',
          status: 'ok',
        });
        state.snapshot.factory.running = 2;
      },
    },
    {
      at: 32,
      run: (state, now) => {
        patchAgent(state, 'coordinator', {
          state: 'tool',
          action: {
            kind: 'tool',
            label: 'mcp_graphify_get_neighbors',
            detail: 'desktop/src/island/QuickReply.tsx',
            startedAt: iso(now),
          },
        });
        activity(state, now, {
          kind: 'tool',
          profile: 'coordinator',
          issueKey: KEYS.shortcut,
          label: 'mcp_graphify_get_neighbors',
          detail: 'desktop/src/island/QuickReply.tsx',
          status: 'ok',
          durationMs: 1_400,
          model: 'mix',
        });
      },
    },
    {
      at: 36,
      run: (state, now) => {
        patchAgent(state, 'coordinator', {
          action: {
            kind: 'tool',
            label: 'skill_view',
            detail: 'factory-brief',
            startedAt: iso(now),
          },
        });
        activity(state, now, {
          kind: 'skill',
          profile: 'coordinator',
          issueKey: KEYS.shortcut,
          label: 'Skill chargée',
          detail: 'factory-brief',
          status: 'ok',
        });
      },
    },
    {
      at: 40,
      run: (state, now) => {
        patchAgent(state, 'coder-claude', {
          state: 'tool',
          laneModel: null,
          action: {
            kind: 'tool',
            label: 'terminal',
            detail: 'npm test (relancé par Hermès)',
            startedAt: iso(now),
          },
        });
        activity(state, now, {
          kind: 'tool',
          profile: 'coder-claude',
          issueKey: KEYS.team,
          cardId: CARDS.teamImpl,
          label: 'claude -p terminé',
          detail: '6 min 12 s, 23 tours, 0,84 $US',
          status: 'ok',
          durationMs: 372_000,
          model: 'claude-opus-5-5',
        });
        appendTranscript(
          state,
          RUNS.teamImpl,
          'hermes',
          {
            at: iso(now),
            role: 'tool_result',
            text: 'evidence/10-claude-run.json : 23 tours, 6 min 12 s, total_cost_usd 0,84, is_error false',
            toolName: 'terminal',
            model: null,
            status: 'ok',
          },
          '\u001b[32m  claude -p terminé\u001b[0m 23 tours, 6 min 12 s',
        );
      },
    },
    {
      at: 44,
      run: (state, now) => {
        patchAgent(state, 'coder-claude', {
          action: {
            kind: 'tool',
            label: 'terminal',
            detail: 'git push -u origin feat/71-equipe-par-projet',
            startedAt: iso(now),
          },
        });
        activity(state, now, {
          kind: 'tool',
          profile: 'coder-claude',
          issueKey: KEYS.team,
          cardId: CARDS.teamImpl,
          label: 'terminal',
          detail: 'npm test : 13 réussis (relancé par Hermès)',
          status: 'ok',
          durationMs: 30_800,
          model: QWEN_LOCAL,
        });
      },
    },
    {
      at: 47,
      run: (state, now) => {
        patchIssue(state, KEYS.team, {
          pr: {
            number: 75,
            url: prUrl('claude-cockpit', 75),
            title: 'feat(team): regrouper les cartes par projet (#71)',
            state: 'draft',
            checks: 'pending',
            reviewDecision: null,
            autoMerge: false,
            additions: 184,
            deletions: 23,
            changedFiles: 3,
          },
          updatedAt: iso(now),
        });
        activity(state, now, {
          kind: 'github',
          profile: 'coder-claude',
          issueKey: KEYS.team,
          label: 'PR #75 ouverte en brouillon',
          detail: 'Par la GitHub App code-my-life-factory',
        });
        addTimeline(state, KEYS.team, {
          at: iso(now),
          source: 'github',
          profile: 'coder-claude',
          cardId: CARDS.teamImpl,
          label: 'PR #75 ouverte en brouillon',
          detail: '+184 −23, 3 fichiers',
          tone: 'neutral',
        });
      },
    },
    {
      at: 50,
      run: (state, now) => {
        patchCard(state, KEYS.team, CARDS.teamImpl, { status: 'review' });
        patchRun(state, KEYS.team, CARDS.teamImpl, RUNS.teamImpl, {
          status: 'done',
          outcome: 'review_requested',
          endedAt: iso(now),
          summary: 'groupByProject + vue ÉQUIPE, 13 tests verts, PR #75',
        });
        patchIssue(state, KEYS.team, {
          station: 'gate',
          activeProfiles: [],
          updatedAt: iso(now),
        });
        patchAgent(state, 'coder-claude', {
          state: 'idle',
          cardId: null,
          issueKey: null,
          action: null,
          laneModel: null,
          runStartedAt: null,
          model: model('llamacpp', QWEN_LOCAL),
        });
        addTimeline(state, KEYS.team, {
          at: iso(now),
          source: 'kanban',
          profile: 'coder-claude',
          cardId: CARDS.teamImpl,
          label: 'Revue demandée à gate-claude',
          detail: 'coder-guard : branche poussée au même commit, PR #75 citée',
          tone: 'success',
        });
        activity(state, now, {
          kind: 'kanban',
          profile: 'coder-claude',
          issueKey: KEYS.team,
          cardId: CARDS.teamImpl,
          label: 'Revue demandée à gate-claude',
          detail: 'Label claude:opus : la gate passe par gate-claude',
          status: 'ok',
        });
        state.snapshot.factory.running = 1;
      },
    },
    {
      at: 53,
      run: (state, now) => {
        patchAgent(state, 'coordinator', {
          action: {
            kind: 'tool',
            label: 'kanban_create',
            detail: 'impl claude-cockpit#73 → coder',
            startedAt: iso(now),
          },
        });
        activity(state, now, {
          kind: 'tool',
          profile: 'coordinator',
          issueKey: KEYS.shortcut,
          label: 'kanban_create',
          detail: 'impl claude-cockpit#73 → coder, release → coordinator',
          status: 'ok',
          durationMs: 600,
          model: 'mix',
        });
      },
    },
    {
      at: 56,
      run: (state, now) => {
        patchAgent(state, 'gate-claude', {
          state: 'thinking',
          cardId: CARDS.teamImpl,
          issueKey: KEYS.team,
          model: model('freellmapi', 'agnes-2.5-flash', 'live'),
          action: {
            kind: 'llm',
            label: 'Appel au modèle',
            detail: 'auto, routé vers agnes-2.5-flash',
            startedAt: iso(now),
          },
          runStartedAt: iso(now),
          lastHeartbeatAt: iso(now),
        });
        patchIssue(state, KEYS.team, { activeProfiles: ['gate-claude'], updatedAt: iso(now) });
        addRun(state, KEYS.team, CARDS.teamImpl, {
          id: 186,
          profile: 'gate-claude',
          role: 'reviewer',
          status: 'running',
          outcome: null,
          startedAt: iso(now),
          endedAt: null,
          model: model('freellmapi', 'agnes-2.5-flash', 'live'),
          laneModel: model('anthropic', 'claude-opus-5-5', 'config'),
          summary: null,
          tokens: null,
          costUsd: null,
        });
        patchCard(state, KEYS.team, CARDS.teamImpl, { status: 'running', assignee: 'gate-claude' });
        activity(state, now, {
          kind: 'kanban',
          profile: 'gate-claude',
          issueKey: KEYS.team,
          cardId: CARDS.teamImpl,
          label: 'claimed',
          detail: 'gate-claude prend la revue',
          status: 'ok',
        });
        state.snapshot.factory.running = 2;
      },
    },
    {
      at: 58,
      run: (state, now) => {
        patchAgent(state, 'coordinator', {
          state: 'idle',
          cardId: null,
          issueKey: null,
          action: null,
          runStartedAt: null,
        });
        patchCard(state, KEYS.shortcut, CARDS.shortcutBrief, { status: 'done' });
        patchRun(state, KEYS.shortcut, CARDS.shortcutBrief, 185, {
          status: 'done',
          outcome: 'completed',
          endedAt: iso(now),
          summary: 'Brief rédigé : base a41d9e0, test fail-first desktop/test/quick-reply.test.js',
        });
        const detail = state.details[KEYS.shortcut];
        detail?.cards.push(
          {
            id: CARDS.shortcutImpl,
            title: `impl ${KEYS.shortcut} : raccourci de réponse`,
            kind: 'impl',
            status: 'ready',
            assignee: 'coder',
            station: 'implementation',
            blockKind: null,
            blockReason: null,
            parents: [CARDS.shortcutBrief],
            skills: ['factory-author-proof'],
            runs: [],
            changedFiles: [],
            testsPassed: null,
            testsTotal: null,
          },
          {
            id: CARDS.shortcutRelease,
            title: `release ${KEYS.shortcut}`,
            kind: 'release',
            status: 'todo',
            assignee: 'coordinator',
            station: 'release',
            blockKind: null,
            blockReason: null,
            parents: [CARDS.shortcutImpl],
            skills: ['factory-release'],
            runs: [],
            changedFiles: [],
            testsPassed: null,
            testsTotal: null,
          },
        );
        patchIssue(state, KEYS.shortcut, {
          station: 'implementation',
          status: 'queued',
          activeProfiles: [],
          harness: 'coder',
          updatedAt: iso(now),
        });
        addTimeline(state, KEYS.shortcut, {
          at: iso(now),
          source: 'kanban',
          profile: 'coordinator',
          cardId: CARDS.shortcutBrief,
          label: 'Brief rédigé, 2 cartes créées',
          detail: 'impl → coder (Hermès natif), release → coordinator',
          tone: 'success',
        });
        state.snapshot.factory.running = 1;
      },
    },
    {
      at: 60,
      run: (state, now) => {
        patchAgent(state, 'coder', {
          state: 'thinking',
          cardId: CARDS.shortcutImpl,
          issueKey: KEYS.shortcut,
          model: model('freellmapi', 'agnes-2.5-flash', 'live'),
          action: {
            kind: 'llm',
            label: 'Appel au modèle',
            detail: 'auto, routé vers agnes-2.5-flash',
            startedAt: iso(now),
          },
          runStartedAt: iso(now),
          lastHeartbeatAt: iso(now),
        });
        patchCard(state, KEYS.shortcut, CARDS.shortcutImpl, { status: 'running' });
        patchIssue(state, KEYS.shortcut, {
          status: 'active',
          activeProfiles: ['coder'],
          updatedAt: iso(now),
        });
        activity(state, now, {
          kind: 'kanban',
          profile: 'coder',
          issueKey: KEYS.shortcut,
          cardId: CARDS.shortcutImpl,
          label: 'claimed',
          detail: "coder prend l'implémentation",
          status: 'ok',
        });
        state.snapshot.factory.running = 2;
      },
    },
    {
      at: 64,
      run: (state, now) => {
        patchAgent(state, 'coder', {
          model: model('freellmapi', 'dots3-note-preview', 'live'),
          action: {
            kind: 'llm',
            label: 'Appel au modèle',
            detail: 'Fallback : dots3-note-preview après un 429 sur agnes-2.5-flash',
            startedAt: iso(now),
          },
        });
        activity(state, now, {
          kind: 'llm',
          profile: 'coder',
          issueKey: KEYS.shortcut,
          cardId: CARDS.shortcutImpl,
          label: '429 sur agnes-2.5-flash',
          detail: 'freellmapi : fallback vers dots3-note-preview',
          status: 'error',
          model: 'agnes-2.5-flash',
        });
        patchHealth(state, 'freellmapi', {
          status: 'degraded',
          detail: '429 en hausse sur agnes-2.5-flash, fallback actif',
          checkedAt: iso(now),
          metrics: [{ label: '429 sur 10 min', value: '3' }],
        });
      },
    },
    ...toolLoop(CODER_SHORTCUT, 68, 5, 140, coderShortcutStep),
    ...toolLoop(GATE_TEAM, 70, 7, 140, gateTeamStep),
  ];
  return steps.sort((left, right) => left.at - right.at);
}
