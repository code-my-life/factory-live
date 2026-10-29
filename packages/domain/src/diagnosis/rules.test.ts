import { describe, expect, it } from 'vitest';
import { aRun, aTask, anEvent } from '../fixtures.test-helpers.ts';
import { diagnose } from './diagnose.ts';
import { FACTORY_HOOKS, coderProfile } from './incidents.fixture-builder.test-helpers.ts';
import type { DiagnosisInput, LogFact, ProfileFacts, SessionFacts } from './types.ts';

/*
 * Les règles qu'aucun incident réel du kanban n'a encore déclenchées, sur les formats exacts
 * d'Hermès (plugins_dispatch.py, tool_executor.py, kanban_db_dispatch.py).
 */

const T0 = 1_800_000_000;

/** Une carte bloquée après un run de coder, de T0 à T0 + 600 ; chaque test précise ses faits. */
function input(patch: Partial<DiagnosisInput> = {}): DiagnosisInput {
  const blocked = anEvent({
    id: 10,
    runId: 1,
    kind: 'blocked',
    createdAt: T0 + 600,
    payload: { kind: 'capability' },
  });
  return {
    now: T0 + 610,
    board: 'factory',
    task: aTask({
      id: 't_1',
      status: 'blocked',
      blockKind: 'capability',
      assignee: 'coder',
      createdAt: T0 - 10,
    }),
    runs: [
      aRun({
        id: 1,
        taskId: 't_1',
        profile: 'coder',
        outcome: 'blocked',
        startedAt: T0,
        endedAt: T0 + 600,
      }),
    ],
    events: [anEvent({ id: 1, kind: 'created', createdAt: T0 - 10 }), blocked],
    anchor: blocked,
    sessions: [],
    logs: [],
    profile: coderProfile(),
    evidence: null,
    branch: null,
    prUrl: null,
    ...patch,
  };
}

/** Une session : chaque ligne est un appel et son résultat, aux secondes données après T0. */
function session(
  runId: number,
  steps: readonly (readonly [
    tool: string,
    command: string | null,
    content: string,
    at: number,
    took?: number,
  ])[],
): SessionFacts {
  return {
    id: `s_${runId}`,
    runId,
    calls: steps.map(([tool, command, , at], index) => ({
      at: T0 + at,
      tool,
      input: command,
      callId: `c${runId}_${index}`,
    })),
    results: steps.map(([tool, , content, at, took = 1], index) => ({
      at: T0 + at + took,
      tool,
      callId: `c${runId}_${index}`,
      content,
    })),
  };
}

function log(kind: LogFact['kind'], at: number, patch: Partial<LogFact> = {}): LogFact {
  return {
    at: T0 + at,
    sessionId: null,
    kind,
    hook: null,
    callback: null,
    module: null,
    seconds: null,
    plugin: null,
    detail: null,
    count: null,
    line: kind,
    ...patch,
  };
}

describe('gardes et plugins', () => {
  it('une garde dont les appels abandonnés tournent encore : le plugin nommé par son module', () => {
    const diagnosis = diagnose(
      input({
        logs: [
          log('hook_abandoned', 300, {
            hook: 'pre_tool_call',
            callback: 'guard',
            module: 'hermes_plugins.gate_readonly',
            count: 3,
          }),
        ],
      }),
    );
    expect(diagnosis.primary).toMatchObject({
      code: 'guard_hook_hung',
      actor: 'you_factory',
      runIds: [1],
    });
    expect(diagnosis.primary.why.params).toEqual({ plugin: 'gate-readonly', workers: 3 });
    expect(diagnosis.primary.steps.map((step) => step.text.code)).toEqual([
      'diagnosis.step.fixPlugin',
      'diagnosis.step.reinstall',
    ]);
  });

  it('une garde qui plante : Hermès refuse l’outil, la garde est retrouvée par son callback', () => {
    const diagnosis = diagnose(
      input({
        profile: coderProfile({ plugins: ['comment-guard'] }),
        sessions: [
          session(1, [
            [
              'terminal',
              'gh pr view 3',
              '{"error": "pre_tool_call plugin callback guard raised KeyError: \'args\'"}',
              100,
            ],
          ]),
        ],
      }),
    );
    expect(diagnosis.primary).toMatchObject({
      code: 'guard_hook_raised',
      subject: { plugin: 'comment-guard' },
    });
    expect(diagnosis.runs[0]?.text).toEqual({
      code: 'diagnosis.run.blockedAfterRefusals',
      params: { count: 1 },
    });
  });

  it('un plugin qui ne se charge pas au démarrage de l’agent', () => {
    const diagnosis = diagnose(
      input({
        logs: [
          log('plugin_load_failed', 2, {
            plugin: 'factory-notify',
            detail: "No module named 'factory_issue'",
          }),
        ],
      }),
    );
    expect(diagnosis.primary).toMatchObject({
      code: 'plugin_load_failed',
      cause: { state: 'present' },
      summary: { params: { plugin: 'factory-notify' } },
    });
    expect(diagnosis.unblock.when).toBe('after_fix');
  });

  it('un refus de garde qui clôt le run, sans boucle : à l’agent de corriger', () => {
    const diagnosis = diagnose(
      input({
        task: aTask({
          id: 't_1',
          status: 'blocked',
          blockKind: null,
          assignee: 'coder',
          createdAt: T0 - 10,
        }),
        sessions: [
          session(1, [
            ['terminal', 'npm test', '{"output": "ok", "exit_code": 0, "error": null}', 50],
            [
              'terminal',
              'git push origin main',
              '{"error": "coder-guard : push direct sur main interdit : branche + PR."}',
              100,
            ],
          ]),
        ],
      }),
    );
    expect(diagnosis.primary).toMatchObject({
      code: 'guard_refusal',
      actor: 'agent',
      subject: { plugin: 'coder-guard' },
    });
    expect(diagnosis.unblock).toMatchObject({
      when: 'now',
      template: { code: 'diagnosis.unblock.causeFixed' },
    });
  });
});

describe('limites d’Hermès', () => {
  it('la durée maximale d’un run, lue dans l’erreur du run ou dans son délai dépassé', () => {
    const fromError = diagnose(
      input({
        task: aTask({
          id: 't_1',
          status: 'blocked',
          assignee: 'coder',
          createdAt: T0 - 10,
          maxRuntimeSeconds: 7200,
        }),
        runs: [
          aRun({
            id: 1,
            taskId: 't_1',
            outcome: 'timed_out',
            startedAt: T0,
            endedAt: T0 + 600,
            error: 'elapsed 7300s > limit 7200s',
          }),
        ],
      }),
    );
    expect(fromError.primary).toMatchObject({ code: 'runtime_limit', cause: { state: 'present' } });
    expect(fromError.primary.why.params).toEqual({ seconds: 7300, limit: 7200 });
    expect(fromError.runs[0]?.text.code).toBe('diagnosis.run.timedOut');
    const raised = diagnose(
      input({
        task: aTask({
          id: 't_1',
          status: 'blocked',
          assignee: 'coder',
          createdAt: T0 - 10,
          maxRuntimeSeconds: 10_000,
        }),
        events: [
          anEvent({ id: 1, kind: 'created', createdAt: T0 - 10 }),
          anEvent({
            id: 5,
            runId: 1,
            kind: 'timed_out',
            createdAt: T0 + 500,
            payload: { elapsed_seconds: 7300, limit_seconds: 7200 },
          }),
          anEvent({ id: 10, runId: 1, kind: 'blocked', createdAt: T0 + 600 }),
        ],
      }),
    );
    expect(raised.primary).toMatchObject({ code: 'runtime_limit', cause: { state: 'unknown' } });
  });

  it('le plafond d’un outil : présent, corrigé après coup, ou inconnu sans config', () => {
    const deadline = [
      session(1, [
        [
          'terminal',
          'npm run e2e',
          "Error executing tool 'terminal': timed out after 420.0s",
          100,
          420,
        ],
      ]),
    ];
    const present = diagnose(input({ sessions: deadline }));
    expect(present.primary).toMatchObject({
      code: 'tool_deadline',
      cause: { state: 'present' },
      setting: { key: 'timeouts.tools.sequential_call', observed: 420, effective: 420 },
    });
    expect(present.primary.steps[0]?.command).toBe(
      'hermes -p coder config set timeouts.tools.sequential_call 900',
    );
    const fixed = diagnose(
      input({
        sessions: deadline,
        profile: coderProfile({ toolDeadline: 900, changedAt: T0 + 700 }),
      }),
    );
    expect(fixed.primary.cause).toMatchObject({ state: 'fixed', at: T0 + 700 });
    const contradiction = diagnose(
      input({ sessions: deadline, profile: coderProfile({ toolDeadline: 900, changedAt: T0 }) }),
    );
    expect(contradiction.primary.cause).toEqual({ state: 'unknown' });
    expect(diagnose(input({ sessions: deadline, profile: null })).primary.cause).toEqual({
      state: 'unknown',
    });
  });

  it('une commande arrêtée par le délai du terminal : à l’agent de la découper', () => {
    const diagnosis = diagnose(
      input({
        sessions: [
          session(1, [
            [
              'terminal',
              'npm run e2e',
              '{"output": "[Command timed out after 900s]", "exit_code": 124, "error": null}',
              100,
            ],
          ]),
        ],
      }),
    );
    expect(diagnosis.primary).toMatchObject({ code: 'command_timeout', actor: 'agent' });
    expect(diagnosis.primary.summary.params).toEqual({ seconds: 900 });
  });

  it('sans durée dans la sortie, le délai du terminal de l’agent, sinon celui d’Hermès', () => {
    const silent = [
      session(1, [['terminal', 'npm run e2e', '{"output": "", "exit_code": 124}', 100]]),
    ];
    const seconds = (profile: ProfileFacts) =>
      diagnose(input({ sessions: silent, profile })).primary.summary.params;
    expect(seconds(coderProfile({ terminalTimeout: 600 }))).toEqual({ seconds: 600 });
    expect(seconds(coderProfile({ terminalTimeout: null }))).toEqual({ seconds: 180 });
  });
});

describe('fournisseurs, disjoncteur, repli', () => {
  it('un fournisseur qui rejette la clé ou le modèle', () => {
    const diagnosis = diagnose(
      input({
        events: [
          anEvent({ id: 1, kind: 'created', createdAt: T0 - 10 }),
          anEvent({
            id: 10,
            runId: 1,
            kind: 'crashed',
            createdAt: T0 + 600,
            payload: {
              exit_kind: 'terminal_provider',
              exit_code: 78,
              terminal_provider: true,
              worker_output: 'auth failed',
            },
          }),
        ],
        anchor: null,
      }),
    );
    expect(diagnosis.primary).toMatchObject({
      code: 'provider_terminal',
      actor: 'you_factory',
      runIds: [1],
    });
  });

  it('le disjoncteur seul : trois sorties sans appel kanban, sans leurs runs', () => {
    const gaveUp = anEvent({
      id: 10,
      kind: 'gave_up',
      createdAt: T0 + 600,
      payload: { protocol_violations: 3, error: 'protocol violation' },
    });
    const diagnosis = diagnose(
      input({
        runs: [],
        events: [anEvent({ id: 1, kind: 'created', createdAt: T0 - 10 }), gaveUp],
        anchor: gaveUp,
      }),
    );
    expect(diagnosis.primary).toMatchObject({
      code: 'protocol_breaker',
      summary: { params: { count: 3 } },
    });
    expect(diagnosis.unblock.template?.code).toBe('diagnosis.unblock.finishWithKanbanCall');
  });

  it('une sortie après des appels kanban en erreur : le verdict compte ces erreurs', () => {
    const diagnosis = diagnose(
      input({
        runs: [
          aRun({
            id: 1,
            taskId: 't_1',
            outcome: 'crashed',
            startedAt: T0,
            endedAt: T0 + 600,
            metadata: { protocol_violation: true },
          }),
        ],
        sessions: [
          session(1, [
            [
              'kanban_complete',
              null,
              '{"error": "kanban_complete could not preserve the declared artifacts"}',
              100,
            ],
            [
              'kanban_complete',
              null,
              '{"error": "kanban_complete could not preserve the declared artifacts"}',
              200,
            ],
          ]),
        ],
      }),
    );
    expect(diagnosis.primary.code).toBe('stopped_after_refusals');
    expect(diagnosis.runs[0]?.text).toEqual({
      code: 'diagnosis.run.refusedThenStopped',
      params: { count: 2 },
    });
  });

  it('rien de reconnu : les derniers signaux, tels quels, et la phrase de l’agent pour titre', () => {
    const diagnosis = diagnose(
      input({
        task: aTask({
          id: 't_1',
          status: 'blocked',
          blockKind: null,
          assignee: 'coder',
          createdAt: T0 - 10,
        }),
        sessions: [session(1, [['patch', 'a.ts', '{"error": "path required"}', 100]])],
      }),
    );
    expect(diagnosis.primary).toMatchObject({
      code: 'unexplained',
      confidence: 'likely',
      actor: 'you_answer',
    });
    expect(diagnosis.primary.evidence[0]?.quote).toBe('{"error": "path required"}');
    expect(diagnosis.unblock).toEqual({ when: 'answer', template: null, nextBlock: 'blocked' });
  });
});

describe('l’état du travail', () => {
  it('un commit fait et une branche poussée se lisent dans les sorties du terminal', () => {
    const diagnosis = diagnose(
      input({
        branch: 'fix/1-x',
        prUrl: 'https://github.com/code-my-life/factory-live/pull/3',
        sessions: [
          session(1, [
            ['write_file', 'apps/web/a.ts', '{"bytes_written": 10}', 10],
            ['patch', 'apps/web/a.ts', '{"success": true}', 20],
            [
              'terminal',
              'git commit -m "fix: x"',
              '{"output": "[fix/1-x b055de5] fix: x\\n 1 file changed", "exit_code": 0, "error": null}',
              30,
            ],
            [
              'terminal',
              'git push -u origin fix/1-x',
              '{"output": "To github.com:code-my-life/factory-live.git", "exit_code": 0, "error": null}',
              40,
            ],
          ]),
        ],
      }),
    );
    expect(diagnosis.work).toEqual({
      branch: 'fix/1-x',
      commits: 'some',
      commitsRefused: 0,
      pushed: 'yes',
      prUrl: 'https://github.com/code-my-life/factory-live/pull/3',
      editedFiles: 1,
      evidence: [],
    });
  });

  it('lit une sortie piégée de crochets en temps linéaire, sans y voir de commit', () => {
    const trap = `{"output": "${'['.repeat(200_000)}", "exit_code": 0, "error": null}`;
    const started = Date.now();
    const diagnosis = diagnose(
      input({ sessions: [session(1, [['terminal', 'git commit -m "x"', trap, 30]])] }),
    );
    expect(Date.now() - started).toBeLessThan(500);
    expect(diagnosis.work?.commits).toBe('none');
  });

  it('une PR connue sur la branche prouve le push, même sans session lisible', () => {
    const work = diagnose(
      input({
        sessions: null,
        branch: 'fix/1-x',
        prUrl: 'https://github.com/code-my-life/factory-live/pull/3',
      }),
    ).work;
    expect(work).toMatchObject({ commits: 'unknown', pushed: 'yes' });
  });

  it('sans sessions lisibles, le travail est inconnu ; sans rien, il n’y a rien à raconter', () => {
    expect(diagnose(input({ sessions: null, branch: 'fix/1-x' })).work).toMatchObject({
      commits: 'unknown',
      pushed: 'unknown',
    });
    expect(diagnose(input({ sessions: null })).work).toBeNull();
  });

  it('un journal rattaché par l’heure à la seule session de l’agent', () => {
    const diagnosis = diagnose(
      input({
        profile: coderProfile({ hooks: FACTORY_HOOKS }),
        sessions: [
          session(1, [
            [
              'terminal',
              'git commit -m x',
              '{"error": "pre_tool_call plugin callback timed out or is still running"}',
              100,
              30,
            ],
          ]),
        ],
        logs: [
          log('hook_timeout', 130, {
            hook: 'pre_tool_call',
            callback: 'pre_tool',
            seconds: 30,
            line: "Hook 'pre_tool_call' callback pre_tool timed out after 30s",
          }),
        ],
      }),
    );
    expect(diagnosis.primary).toMatchObject({
      code: 'guard_hook_timeout',
      confidence: 'certain',
      subject: { plugin: 'coder-guard' },
    });
  });
});
