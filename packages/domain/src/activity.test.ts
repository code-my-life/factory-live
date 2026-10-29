import { describe, expect, it } from 'vitest';
import { agentKey, applyHook, cardOfCwd, describeToolCall, taskIdFromCwd } from './activity.ts';
import { message } from './messages.ts';
import type { ActivityLine, HookEvent, LiveAgent, RunningCard } from './activity.ts';

const CARD = 't_5e21c0d9';
const KEY = agentKey('coder-claude', CARD, 's1');

function hook(event: string, patch: Partial<HookEvent> = {}): HookEvent {
  return {
    event,
    profile: 'coder-claude',
    sessionId: 's1',
    cwd: `/home/cleme/.hermes/kanban/boards/factory/workspaces/${CARD}`,
    toolName: null,
    toolInput: null,
    extra: {},
    at: 1_000_000,
    ...patch,
  };
}

function run(
  events: HookEvent[],
  start: ReadonlyMap<string, LiveAgent> = new Map(),
  running: readonly RunningCard[] = [],
) {
  let agents = new Map(start);
  const lines: ActivityLine[] = [];
  for (const event of events) {
    const result = applyHook(agents, event, running);
    agents = result.agents;
    lines.push(...result.lines);
  }
  return { agents, lines };
}

describe('taskIdFromCwd', () => {
  it('lit la carte dans le workspace ou le worktree du worker', () => {
    expect(taskIdFromCwd('/home/cleme/.hermes/kanban/boards/factory/workspaces/t_83b0e611')).toBe(
      't_83b0e611',
    );
    expect(
      taskIdFromCwd('/home/cleme/.hermes/kanban/boards/factory/workspaces/t_83b0e611/repo'),
    ).toBe('t_83b0e611');
    expect(taskIdFromCwd('/home/cleme/perso/claude-cockpit/.worktrees/t_5e21c0d9')).toBe(
      't_5e21c0d9',
    );
    expect(taskIdFromCwd('/home/cleme/.hermes/hermes-agent')).toBeNull();
    expect(taskIdFromCwd('/home/cleme/workspaces/t_83b0e611x')).toBeNull();
  });
});

const CLONE = '/home/cleme/perso/factory-live';
const IMPL_WORKTREE = '/home/cleme/perso/claude-cockpit/.worktrees/t_2fe761e4';

describe('cardOfCwd', () => {
  it('relie un worker lancé dans le clone (workspace dir:) à la carte en cours de son profil', () => {
    const running: RunningCard[] = [
      { id: 't_8c92404a', assignee: 'tool-setup', workspacePath: CLONE },
    ];
    expect(cardOfCwd(CLONE, 'tool-setup', running)).toBe('t_8c92404a');
    expect(cardOfCwd(`${CLONE}/apps/web`, 'tool-setup', running)).toBe('t_8c92404a');
  });

  it('attribue la reprise de la gate à sa carte, pas à la carte impl dont elle occupe le worktree', () => {
    const running: RunningCard[] = [
      { id: 't_1ab0b0db', assignee: 'gate', workspacePath: IMPL_WORKTREE },
      { id: 't_2fe761e4', assignee: 'coder', workspacePath: IMPL_WORKTREE },
    ];
    expect(cardOfCwd(IMPL_WORKTREE, 'gate', running)).toBe('t_1ab0b0db');
    expect(cardOfCwd(IMPL_WORKTREE, 'coder', running)).toBe('t_2fe761e4');
  });

  it('retient le workspace le plus précis qui contient le dossier', () => {
    const running: RunningCard[] = [
      { id: 't_00000001', assignee: 'coder', workspacePath: CLONE },
      { id: 't_00000002', assignee: 'coder', workspacePath: `${CLONE}/packages/domain/` },
    ];
    expect(cardOfCwd(`${CLONE}/packages/domain/src`, 'coder', running)).toBe('t_00000002');
    expect(cardOfCwd(`${CLONE}/apps`, 'coder', running)).toBe('t_00000001');
  });

  it('ne devine pas : ni carte d’un autre profil, ni dossier voisin, ni égalité entre deux cartes', () => {
    expect(
      cardOfCwd(CLONE, 'coder', [
        { id: 't_8c92404a', assignee: 'tool-setup', workspacePath: CLONE },
      ]),
    ).toBeNull();
    expect(
      cardOfCwd(`${CLONE}-2`, 'tool-setup', [
        { id: 't_8c92404a', assignee: 'tool-setup', workspacePath: CLONE },
      ]),
    ).toBeNull();
    expect(
      cardOfCwd(CLONE, 'coder', [
        { id: 't_00000001', assignee: 'coder', workspacePath: CLONE },
        { id: 't_00000002', assignee: 'coder', workspacePath: CLONE },
      ]),
    ).toBeNull();
    expect(
      cardOfCwd('/', 'coder', [{ id: 't_00000001', assignee: 'coder', workspacePath: '/' }]),
    ).toBeNull();
  });

  it('à égalité, garde la carte que nomme le chemin', () => {
    expect(
      cardOfCwd(IMPL_WORKTREE, 'coder', [
        { id: 't_00000003', assignee: 'coder', workspacePath: IMPL_WORKTREE },
        { id: 't_2fe761e4', assignee: 'coder', workspacePath: IMPL_WORKTREE },
      ]),
    ).toBe('t_2fe761e4');
  });

  it('sans carte en cours connue, lit l’id dans le workspace ou le worktree', () => {
    expect(cardOfCwd(`${IMPL_WORKTREE}/src`, 'coder')).toBe('t_2fe761e4');
    expect(cardOfCwd(CLONE, 'tool-setup')).toBeNull();
  });
});

describe('describeToolCall', () => {
  it('reconnaît une lane Claude Code et son modèle', () => {
    const call = describeToolCall('terminal', {
      command: 'claude -p "$(cat evidence/brief.md)" --model claude-opus-5-5 --max-turns 40',
    });
    expect(call).toMatchObject({
      lane: 'claude-code',
      laneModel: 'claude-opus-5-5',
      label: 'claude -p',
    });
  });

  it('reconnaît une lane OpenCode', () => {
    expect(
      describeToolCall('terminal', {
        command:
          'cd repo && opencode run "$(cat evidence/brief.md)" --model=freellmapi/agnes-2.5-flash',
      }),
    ).toMatchObject({
      lane: 'opencode',
      laneModel: 'freellmapi/agnes-2.5-flash',
    });
  });

  it('ne prend pas un simple mot claude pour une lane', () => {
    expect(describeToolCall('terminal', { command: 'grep -rn claude-code docs/' }).lane).toBeNull();
  });

  it('résume les outils courants sur une ligne', () => {
    expect(describeToolCall('terminal', { command: 'npm test -- team\nexit' })).toMatchObject({
      label: 'terminal',
      detail: 'npm test -- team',
    });
    expect(describeToolCall('read_file', { path: 'desktop/src/team/TeamView.tsx' }).detail).toBe(
      'desktop/src/team/TeamView.tsx',
    );
    expect(describeToolCall('skill_view', { name: 'factory-brief' }).detail).toBe('factory-brief');
    expect(describeToolCall('terminal', { command: 'x'.repeat(500) }).detail).toHaveLength(200);
  });
});

describe('applyHook', () => {
  it('suit un outil : en cours, puis fini avec sa durée, et l’agent repasse au modèle', () => {
    let state = run([
      hook('pre_tool_call', { toolName: 'terminal', toolInput: { command: 'npm test' } }),
    ]);
    expect(state.agents.get(KEY)).toMatchObject({
      state: 'tool',
      cardId: CARD,
      sessionId: 's1',
      action: { label: 'terminal', detail: 'npm test' },
    });
    expect(state.lines[0]).toMatchObject({ kind: 'tool', status: 'running', cardId: CARD });

    state = run(
      [
        hook('post_tool_call', {
          toolName: 'terminal',
          toolInput: { command: 'npm test' },
          extra: { status: 'ok', duration_ms: 8_400 },
          at: 1_008_400,
        }),
      ],
      state.agents,
    );
    expect(state.agents.get(KEY)).toMatchObject({
      state: 'thinking',
      action: { kind: 'llm', label: message('activity.action.llm') },
      lastHeartbeatAt: 1_008_400,
      runStartedAt: 1_000_000,
    });
    expect(state.lines[0]).toMatchObject({ kind: 'tool', status: 'ok', durationMs: 8_400 });
  });

  it('montre un refus de garde comme tel, avec son message', () => {
    const { lines } = run([
      hook('post_tool_call', {
        toolName: 'kanban_request_review',
        extra: {
          status: 'blocked',
          error_message: 'coder-guard : PR absente. Pousse la branche puis ouvre la PR.',
        },
      }),
    ]);
    expect(lines[0]).toMatchObject({ kind: 'guard', status: 'blocked' });
    expect(lines[0]?.detail).toContain('coder-guard');
  });

  it('montre l’erreur d’un outil en échec', () => {
    const { lines } = run([
      hook('post_tool_call', {
        toolName: 'read_file',
        toolInput: { path: 'a.ts' },
        extra: { status: 'error', error_message: 'File not found' },
      }),
    ]);
    expect(lines[0]).toMatchObject({ kind: 'tool', status: 'error', detail: 'File not found' });
  });

  it('retient le modèle réellement appelé, même après un fallback', () => {
    let state = run([
      hook('post_api_request', {
        extra: {
          model: 'auto',
          response_model: 'agnes-2.5-flash',
          provider: 'freellmapi',
          api_duration: 3.2,
          usage: { input_tokens: 1200, output_tokens: 80 },
        },
      }),
    ]);
    expect(state.agents.get(KEY)?.model).toEqual({
      model: 'agnes-2.5-flash',
      provider: 'freellmapi',
      at: 1_000_000,
    });
    expect(state.lines[0]).toMatchObject({
      kind: 'llm',
      durationMs: 3_200,
      model: 'agnes-2.5-flash',
      detail: message('activity.llm.tokens', { input: 1200, output: 80 }),
    });
    state = run(
      [
        hook('post_api_request', {
          extra: { model: 'dots3-note-preview', provider: 'freellmapi' },
          at: 1_100_000,
        }),
      ],
      state.agents,
    );
    expect(state.agents.get(KEY)?.model?.model).toBe('dots3-note-preview');
  });

  it('signale un 429 avec le message d’erreur d’Hermès (objet type et message)', () => {
    const { lines } = run([
      hook('api_request_error', {
        extra: {
          model: 'agnes-2.5-flash',
          provider: 'freellmapi',
          status_code: 429,
          retry_count: 0,
          max_retries: 2,
          error: { type: 'RateLimitError', message: 'Too Many Requests' },
        },
      }),
    ]);
    expect(lines[0]).toMatchObject({
      kind: 'llm',
      status: 'error',
      label: message('activity.llm.rateLimited', {
        model: 'agnes-2.5-flash',
        attempt: 1,
        attempts: 3,
      }),
      detail: 'Too Many Requests',
    });
  });

  it('une lane CLI passe l’agent en état cli avec le modèle de la lane, effacé à la fin du CLI', () => {
    const command = 'claude -p "x" --model claude-opus-5-5';
    let state = run([hook('pre_tool_call', { toolName: 'terminal', toolInput: { command } })]);
    expect(state.agents.get(KEY)).toMatchObject({
      state: 'cli',
      laneModel: { model: 'claude-opus-5-5', provider: 'anthropic' },
    });
    state = run(
      [
        hook('post_tool_call', {
          toolName: 'terminal',
          toolInput: { command },
          extra: { status: 'ok' },
        }),
      ],
      state.agents,
    );
    expect(state.agents.get(KEY)?.laneModel).toBeNull();
  });

  it('les événements kanban du dispatcher visent le profil assigné et la carte, pas le gateway', () => {
    const state = run([
      hook('kanban_task_claimed', {
        profile: 'default',
        cwd: '/',
        sessionId: '',
        extra: { task_id: 't_a90c3d18', assignee: 'coordinator', run_id: 185 },
      }),
    ]);
    expect(state.agents.get(agentKey('coordinator', 't_a90c3d18', null))).toMatchObject({
      state: 'thinking',
      cardId: 't_a90c3d18',
      runStartedAt: 1_000_000,
    });
    expect([...state.agents.values()].some((agent) => agent.profile === 'default')).toBe(false);
  });

  it('le worker lancé par le dispatcher et ses webhooks forment un seul agent', () => {
    const { agents } = run([
      hook('kanban_task_claimed', {
        profile: 'default',
        cwd: '/',
        sessionId: '',
        extra: { task_id: CARD, assignee: 'coder-claude' },
      }),
      hook('on_session_start', { at: 1_002_000 }),
      hook('pre_tool_call', { toolName: 'terminal', toolInput: { command: 'ls' }, at: 1_003_000 }),
    ]);
    expect(agents.size).toBe(1);
    expect(agents.get(KEY)).toMatchObject({
      sessionId: 's1',
      runStartedAt: 1_000_000,
      state: 'tool',
    });
  });

  it('l’onboarding lancé dans le clone et ses événements kanban forment un seul agent', () => {
    const { agents, lines } = run(
      [
        hook('kanban_task_claimed', {
          profile: 'default',
          cwd: '/',
          sessionId: '',
          extra: { task_id: 't_8c92404a', assignee: 'tool-setup' },
        }),
        hook('pre_tool_call', {
          profile: 'tool-setup',
          cwd: CLONE,
          toolName: 'terminal',
          toolInput: { command: 'npm ci' },
          at: 1_003_000,
        }),
      ],
      new Map(),
      [{ id: 't_8c92404a', assignee: 'tool-setup', workspacePath: CLONE }],
    );
    expect([...agents.keys()]).toEqual([agentKey('tool-setup', 't_8c92404a', null)]);
    expect(agents.get(agentKey('tool-setup', 't_8c92404a', null))).toMatchObject({
      sessionId: 's1',
      state: 'tool',
    });
    expect(lines.map((item) => item.cardId)).toEqual(['t_8c92404a', 't_8c92404a']);
  });

  it('deux cartes du même profil restent deux agents', () => {
    const { agents } = run([
      hook('pre_tool_call', { toolName: 'terminal', toolInput: { command: 'ls' } }),
      hook('pre_tool_call', {
        toolName: 'terminal',
        toolInput: { command: 'pwd' },
        cwd: '/home/cleme/.hermes/kanban/boards/factory/workspaces/t_00000001',
        sessionId: 's2',
      }),
    ]);
    expect(agents.size).toBe(2);
  });

  it('le texte d’une skill dépend de son action', () => {
    const { lines } = run([
      hook('on_skill_lifecycle', { extra: { action: 'loaded', skill_name: 'factory-brief' } }),
      hook('on_skill_lifecycle', { extra: { action: 'patched', skill_name: 'factory-brief' } }),
    ]);
    expect(lines.map((entry) => entry.label)).toEqual([
      message('activity.skill', { action: 'loaded' }),
      message('activity.skill', { action: 'patched' }),
    ]);
  });

  it('retire l’agent à la fin de sa session, et le signale si elle a échoué', () => {
    const { agents, lines } = run([
      hook('pre_tool_call', { toolName: 'terminal', toolInput: { command: 'ls' } }),
      hook('on_session_end', {
        extra: { completed: false, failed: true, turn_exit_reason: 'max_iterations' },
        at: 1_200_000,
      }),
    ]);
    expect(agents.has(KEY)).toBe(false);
    expect(lines.at(-1)).toMatchObject({
      kind: 'system',
      label: message('activity.session.end', { outcome: 'failed' }),
      detail: 'max_iterations',
      status: 'error',
    });
  });

  it('retire l’agent quand le dispatcher constate la mort ou le silence du worker', () => {
    const claimed = hook('kanban_task_claimed', {
      profile: 'default',
      extra: { task_id: CARD, assignee: 'coder-claude' },
    });
    const exited = run([
      claimed,
      hook('on_kanban_worker_exited', {
        profile: 'default',
        extra: {
          task_id: CARD,
          assignee: 'coder-claude',
          exit_kind: 'crashed',
          outcome: 'crashed',
        },
      }),
    ]);
    expect(exited.agents.size).toBe(0);
    expect(exited.lines.at(-1)).toMatchObject({
      label: message('activity.worker.exited'),
      detail: 'crashed, crashed',
      status: 'error',
    });
    const stale = run([
      claimed,
      hook('on_kanban_worker_stale_claim', {
        profile: 'default',
        extra: { task_id: CARD, assignee: 'coder-claude' },
      }),
    ]);
    expect(stale.agents.size).toBe(0);
    expect(stale.lines.at(-1)?.label).toEqual(message('activity.worker.stale'));
  });

  it('une carte bloquée laisse l’agent visible en état bloqué', () => {
    const { agents, lines } = run([
      hook('kanban_task_blocked', {
        extra: { task_id: CARD, assignee: 'coder-claude', reason: 'Quelle base de données ?' },
      }),
    ]);
    expect(agents.get(KEY)).toMatchObject({ state: 'blocked', action: null });
    expect(lines[0]).toMatchObject({
      kind: 'kanban',
      label: 'blocked',
      detail: 'Quelle base de données ?',
      status: 'blocked',
    });
  });

  it('ignore les événements inconnus et ne modifie jamais l’état reçu', () => {
    const before = new Map<string, LiveAgent>();
    expect(
      applyHook(before, hook('on_kanban_dispatch_tick', { extra: { outcome: 'idle' } })),
    ).toEqual({ agents: new Map(), lines: [] });
    applyHook(
      before,
      hook('pre_tool_call', { toolName: 'terminal', toolInput: { command: 'ls' } }),
    );
    expect(before.size).toBe(0);
  });

  it('suit le lancement du worker, la fin de la carte et les sous-agents', () => {
    const { agents, lines } = run([
      hook('on_kanban_worker_spawned', {
        profile: 'default',
        extra: { task_id: CARD, assignee: 'coder-claude', worker_pid: 4242 },
      }),
      hook('subagent_start', {
        extra: { child_goal: 'Lire la doc de Primer', child_role: 'leaf' },
      }),
      hook('subagent_stop', {
        extra: { child_summary: 'Doc lue', child_status: 'completed', duration_ms: 1_500 },
      }),
      hook('subagent_stop', { extra: { child_status: 'error' } }),
      hook('kanban_task_completed', {
        extra: { task_id: CARD, assignee: 'coder-claude', summary: 'PR #52 ouverte' },
      }),
    ]);
    expect(agents.get(KEY)).toMatchObject({ cardId: CARD });
    expect(lines.map((entry) => [entry.label, entry.detail, entry.status])).toEqual([
      [message('activity.worker.spawned'), 'pid 4242', 'ok'],
      [message('activity.subagent.start'), 'Lire la doc de Primer', 'running'],
      [message('activity.subagent.stop'), 'Doc lue', 'ok'],
      [message('activity.subagent.stop'), null, 'error'],
      ['completed', 'PR #52 ouverte', 'ok'],
    ]);
  });

  it('nomme une erreur d’API autre qu’un 429, sans compteur d’essais inconnu', () => {
    const { lines } = run([
      hook('api_request_error', {
        extra: { model: 'dots3', status_code: 500, reason: 'upstream' },
      }),
    ]);
    expect(lines[0]).toMatchObject({
      label: message('activity.llm.error', {
        status: 500,
        model: 'dots3',
        attempt: null,
        attempts: null,
      }),
      detail: 'upstream',
    });
  });

  it('les textes que factory-live écrit lui-même sont des codes, pas du français', () => {
    const { lines } = run([
      hook('kanban_task_claimed', {
        profile: 'default',
        extra: { task_id: CARD, assignee: 'coder-claude' },
      }),
      hook('on_session_end', { extra: { interrupted: true } }),
      hook('on_session_end', { extra: {} }),
      hook('pre_tool_call', { toolName: null, toolInput: null }),
    ]);
    expect(lines.map((entry) => [entry.label, entry.detail])).toEqual([
      ['claimed', message('activity.kanban.claimed', { profile: 'coder-claude' })],
      [message('activity.session.end', { outcome: 'interrupted' }), null],
      [message('activity.session.end', { outcome: 'completed' }), null],
      [message('activity.tool.unknown'), null],
    ]);
  });
});
