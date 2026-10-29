import { describe, expect, it } from 'vitest';
import { aTask } from '../fixtures.test-helpers.ts';
import { diagnose } from './diagnose.ts';
import { coderProfile, incidentInput } from './incidents.fixture-builder.test-helpers.ts';
import { INCIDENTS } from './incidents.test-helpers.ts';
import type { Diagnosis, DiagnosisInput } from './types.ts';

/*
 * Les cas réels du kanban de la factory (anonymisés, incidents.test-helpers.ts) : ce que le
 * diagnostic aurait dit à Clément au moment de chaque blocage.
 */

const HOOK = INCIDENTS.hookTimeout;
const CONFIG_FIXED_AT = Date.parse('2026-10-29T09:13:08Z') / 1000;

/** factory-live#2 à 09:47, au blocage : sans le run 192, qui n'existait pas encore. */
function atBlock(patch: Partial<DiagnosisInput> = {}): DiagnosisInput {
  return incidentInput('hookTimeout', {
    profile: coderProfile(),
    sessions: HOOK.sessions.filter((session) => session.runId !== 192),
    runs: HOOK.runs.filter((run) => run.id !== 192),
    branch: 'fix/2-server-version-in-settings',
    evidence: [
      { name: '01-test-fails-on-base.txt', bytes: 6715, at: 1_793_253_600 },
      { name: '07-e2e.txt', bytes: 18_903, at: 1_793_262_000 },
    ],
    ...patch,
  });
}

function codes(diagnosis: Diagnosis): string[] {
  return [diagnosis.primary.code, ...diagnosis.others.map((finding) => finding.code)];
}

describe('factory-live#2 (2026-10-29) : le délai du hook de coder-guard', () => {
  it('trouve la cause, qui agit, et retient le déblocage tant qu’elle est là', () => {
    const diagnosis = diagnose(atBlock());
    const { primary } = diagnosis;
    expect(primary.code).toBe('guard_hook_timeout');
    expect(primary.confidence).toBe('certain');
    expect(primary.actor).toBe('you_factory');
    expect(primary.cause).toEqual({ state: 'present' });
    expect(primary.summary).toEqual({
      code: 'diagnosis.summary.guardHookTimeout',
      params: { plugin: 'coder-guard', seconds: 30 },
    });
    expect(primary.why.params).toEqual({
      plugin: 'coder-guard',
      trigger: 'git commit',
      seconds: 30,
    });
    expect(primary.runIds).toEqual([190, 191]);
    expect(primary.setting).toEqual({
      profile: 'coder',
      key: 'plugins.hook_callback_timeout',
      unit: 'seconds',
      observed: 30,
      current: null,
      defaultValue: 30,
      effective: 30,
      repo: null,
    });
    expect(primary.steps.map((step) => [step.text.code, step.command, step.done])).toEqual([
      [
        'diagnosis.step.setValue',
        'hermes -p coder config set plugins.hook_callback_timeout 600',
        false,
      ],
      ['diagnosis.step.reportInRepo', null, false],
      ['diagnosis.step.unblockWithTemplate', null, false],
    ]);
    expect(diagnosis.unblock).toEqual({
      when: 'after_fix',
      nextBlock: 'triage',
      template: {
        code: 'diagnosis.unblock.hookTimeoutFixed',
        params: {
          plugin: 'coder-guard',
          seconds: 30,
          value: 600,
          branch: 'fix/2-server-version-in-settings',
          committed: false,
          evidence: 2,
        },
      },
    });
  });

  it('fonde la cause sur les 17 refus exacts, le journal d’Hermès, l’appel coupé et la config', () => {
    const { evidence } = diagnose(atBlock()).primary;
    expect(evidence.map((item) => [item.source, item.fact.code])).toEqual([
      ['transcript', 'diagnosis.evidence.toolRefusals'],
      ['agent_log', 'diagnosis.evidence.hookTimedOut'],
      ['transcript', 'diagnosis.evidence.trigger'],
      ['plugin', 'diagnosis.evidence.pluginHook'],
      ['config', 'diagnosis.evidence.settingMissing'],
      ['config', 'diagnosis.evidence.toolDeadlineCap'],
    ]);
    expect(evidence[0]?.fact.params).toEqual({
      count: 17,
      tools: 'terminal ×12, kanban_request_review ×3, kanban_complete, tool_search',
    });
    expect(evidence[0]?.quote).toBe(
      '{"error": "pre_tool_call plugin callback timed out or is still running"}',
    );
    expect(evidence[1]?.quote).toMatch(
      /^Hook 'pre_tool_call' callback pre_tool timed out after 30s/,
    );
    expect(evidence[1]?.count).toBe(2);
    // Le premier appel coupé : le git commit du run 190, à 09:35:26.
    expect(evidence[2]?.quote).toMatch(/&& git commit -m "fix: /);
    expect(evidence[2]?.runId).toBe(190);
    expect(evidence[3]?.quote).toBe('ctx.register_hook("pre_tool_call", pre_tool)');
  });

  it('donne à chaque run son verdict : le modèle pour 189, les refus du hook pour 190 et 191', () => {
    const { runs, others } = diagnose(atBlock());
    expect(runs.map((run) => [run.runId, run.finding, run.text])).toEqual([
      [189, 'stopped_without_kanban_call', { code: 'diagnosis.run.modelStopped', params: {} }],
      [
        190,
        'guard_hook_timeout',
        { code: 'diagnosis.run.refusedThenStopped', params: { count: 5 } },
      ],
      [
        191,
        'guard_hook_timeout',
        { code: 'diagnosis.run.blockedAfterRefusals', params: { count: 12 } },
      ],
    ]);
    // 189 a échoué de lui-même ; 190 et 191 ont subi les refus d'Hermès.
    expect(runs.map((run) => run.role)).toEqual(['cause', 'consequence', 'consequence']);
    expect(runs.map((run) => run.sessionId)).toEqual([
      '20261029_085654_8bd48a',
      '20261029_091353_0a2b3f',
      '20261029_093652_fc383d',
    ]);
    // Le run 189 a sa propre cause, sans refus : le modèle a fini son tour sans rendre la carte.
    expect(others.map((finding) => [finding.code, finding.runIds, finding.why.params])).toEqual([
      ['stopped_without_kanban_call', [189], { nudges: 2 }],
    ]);
  });

  it('raconte le travail : rien de commité (3 commits refusés), rien de poussé, les preuves', () => {
    const work = diagnose(atBlock()).work;
    expect(work).toMatchObject({
      branch: 'fix/2-server-version-in-settings',
      commits: 'none',
      commitsRefused: 3,
      pushed: 'no',
      prUrl: null,
    });
    expect(work?.editedFiles).toBeGreaterThanOrEqual(10);
    expect(work?.evidence.map((file) => file.name)).toEqual([
      '01-test-fails-on-base.txt',
      '07-e2e.txt',
    ]);
  });

  it('passe à « corrigée » quand la config de coder change après le dernier refus, et le vérifie au commit suivant', () => {
    const diagnosis = diagnose(
      incidentInput('hookTimeout', {
        profile: coderProfile({ hookTimeout: 600, changedAt: CONFIG_FIXED_AT }),
      }),
    );
    expect(diagnosis.primary.cause).toEqual({
      state: 'fixed',
      at: CONFIG_FIXED_AT,
      verified: true,
      durable: false,
    });
    expect(diagnosis.primary.setting).toMatchObject({ current: 600, effective: 420 });
    expect(diagnosis.unblock.when).toBe('now');
    expect(diagnosis.primary.steps.map((step) => step.done)).toEqual([true, false, false]);
    const facts = diagnosis.primary.evidence.map((item) => item.fact);
    expect(facts).toContainEqual({
      code: 'diagnosis.evidence.settingChanged',
      params: { key: 'plugins.hook_callback_timeout', value: 600 },
    });
    // Le premier commit contrôlé après la correction : refusé par coder-guard (format), mais en 100 s.
    expect(facts).toContainEqual({
      code: 'diagnosis.evidence.commitPassed',
      params: { seconds: 100 },
    });
  });

  it('dit « durable » quand le dépôt de la factory porte la même valeur', () => {
    const { primary } = diagnose(
      incidentInput('hookTimeout', {
        profile: coderProfile({
          hookTimeout: 600,
          changedAt: CONFIG_FIXED_AT,
          repoHookTimeout: 600,
        }),
      }),
    );
    expect(primary.cause).toMatchObject({ state: 'fixed', durable: true });
    expect(primary.steps.map((step) => step.done)).toEqual([true, true, false]);
  });

  it('sans le journal d’Hermès, ne nomme la garde que si un seul plugin branche pre_tool_call', () => {
    const withoutLog = diagnose(atBlock({ logs: null }));
    // coder-guard et comment-guard branchent tous deux pre_tool_call : la cause reste probable.
    expect(withoutLog.primary.confidence).toBe('likely');
    expect(withoutLog.primary.subject.plugin).toBeNull();
    expect(withoutLog.primary.summary.params).toEqual({ plugin: null, seconds: 30 });
    expect(withoutLog.sources).toEqual({
      transcript: true,
      agentLog: false,
      config: true,
      workspace: true,
    });
    const alone = diagnose(
      atBlock({
        logs: null,
        profile: coderProfile({ plugins: ['coder-guard', 'factory-notify'] }),
      }),
    );
    expect(alone.primary.subject.plugin).toBe('coder-guard');
    expect(alone.primary.confidence).toBe('certain');
  });

  it('sans la config de l’agent, ne sait pas si la cause est là', () => {
    const diagnosis = diagnose(atBlock({ profile: null }));
    expect(diagnosis.primary.cause).toEqual({ state: 'unknown' });
    expect(diagnosis.primary.setting?.effective).toBeNull();
    expect(diagnosis.unblock.when).toBe('now');
    expect(diagnosis.sources.config).toBe(false);
  });

  it('rend le même diagnostic quel que soit l’ordre des faits', () => {
    const base = atBlock();
    const shuffled: DiagnosisInput = {
      ...base,
      runs: [...base.runs].reverse(),
      sessions: [...(base.sessions ?? [])].reverse().map((session) => ({
        ...session,
        calls: [...session.calls].reverse(),
        results: [...session.results].reverse(),
      })),
      logs: [...(base.logs ?? [])].reverse(),
    };
    expect(diagnose(shuffled)).toEqual(diagnose(base));
  });

  it('cite le texte de l’agent nulle part ailleurs que dans les citations', () => {
    const text = JSON.stringify(diagnose(atBlock()), (key, value: unknown) =>
      key === 'quote' ? undefined : value,
    );
    expect(text).not.toMatch(/Terminal et tous les outils bloqués/);
  });
});

describe('les autres incidents réels du kanban', () => {
  it('factory-live#2, première tentative : la gate s’arrête trois fois sans rendre la carte, puis le disjoncteur', () => {
    const diagnosis = diagnose(incidentInput('breaker'));
    expect(diagnosis.primary).toMatchObject({
      code: 'stopped_without_kanban_call',
      actor: 'you_factory',
      runIds: [183, 184, 185],
    });
    expect(diagnosis.primary.summary.params).toEqual({ count: 3 });
    expect(diagnosis.primary.steps.map((step) => step.text.code)).toEqual([
      'diagnosis.step.chooseModel',
    ]);
    // Le disjoncteur est la conséquence des trois sorties : il ne passe pas devant.
    expect(codes(diagnosis)).not.toContain('protocol_breaker');
    expect(diagnosis.runs.map((run) => run.text.code)).toEqual([
      'diagnosis.run.modelStopped',
      'diagnosis.run.modelStopped',
      'diagnosis.run.modelStopped',
    ]);
    expect(diagnosis.unblock).toMatchObject({
      when: 'now',
      template: { code: 'diagnosis.unblock.finishWithKanbanCall' },
    });
  });

  it('claude-cockpit#42 (PR 2a) : 65 fois le même refus de coder-guard, budget de tours compris', () => {
    const diagnosis = diagnose(incidentInput('refusalLoop'));
    expect(diagnosis.primary).toMatchObject({
      code: 'refusal_loop',
      actor: 'you_answer',
      runIds: [147, 150],
      subject: { plugin: 'coder-guard' },
    });
    expect(diagnosis.primary.summary.params).toEqual({ plugin: 'coder-guard', count: 65 });
    // Le budget de 400 tours, épuisé par la boucle, en est la conséquence.
    expect(codes(diagnosis)).not.toContain('iteration_budget');
    expect(diagnosis.runs.map((run) => [run.runId, run.text])).toEqual([
      [147, { code: 'diagnosis.run.refusalLoop', params: { count: 62 } }],
      [150, { code: 'diagnosis.run.refusalLoop', params: { count: 3 } }],
    ]);
    expect(diagnosis.unblock).toEqual({
      when: 'now',
      nextBlock: 'triage',
      template: {
        code: 'diagnosis.unblock.refusalLoop',
        params: {
          plugin: 'coder-guard',
          refusal: 'PR de tests, revue refusée (factory-author-proof 1bis) :',
        },
      },
    });
  });

  it('claude-cockpit#42 (PR 2a), plus tôt : une vraie question, à toi de répondre', () => {
    const diagnosis = diagnose(incidentInput('question'));
    expect(diagnosis.primary).toMatchObject({ code: 'question', actor: 'you_answer' });
    expect(diagnosis.unblock).toEqual({ when: 'answer', template: null, nextBlock: 'blocked' });
    expect(diagnosis.runs.map((run) => run.text.code)).toEqual(['diagnosis.run.question']);
    // Débloquée depuis, la carte n'a plus de type : l'événement de blocage garde le sien.
    const later = diagnose(
      incidentInput('question', {
        task: aTask({ ...INCIDENTS.question.task, status: 'done', blockKind: null }),
      }),
    );
    expect(later.primary.code).toBe('question');
  });

  it('claude-cockpit#49 : 150 tours épuisés par coder-claude, à relever dans sa config', () => {
    const unknown = diagnose(incidentInput('budget'));
    expect(unknown.primary).toMatchObject({
      code: 'iteration_budget',
      cause: { state: 'unknown' },
    });
    expect(unknown.primary.summary.params).toEqual({ max: 150 });
    const present = diagnose(
      incidentInput('budget', {
        profile: { ...coderProfile(), profile: 'coder-claude', maxTurns: 150 },
      }),
    );
    expect(present.primary.cause).toEqual({ state: 'present' });
    expect(present.primary.setting).toMatchObject({
      key: 'agent.max_turns',
      observed: 150,
      current: 150,
    });
    expect(present.unblock.when).toBe('after_fix');
    const raised = diagnose(
      incidentInput('budget', {
        profile: {
          ...coderProfile(),
          profile: 'coder-claude',
          maxTurns: 300,
          changedAt: INCIDENTS.budget.now + 60,
        },
      }),
    );
    expect(raised.primary.cause).toMatchObject({ state: 'fixed' });
  });

  it('claude-cockpit#49 (brief) : le quota du fournisseur, rien à faire qu’attendre', () => {
    const diagnosis = diagnose(incidentInput('quota'));
    expect(diagnosis.primary).toMatchObject({
      code: 'provider_quota',
      actor: 'wait',
      runIds: [69, 70],
    });
    expect(diagnosis.unblock).toEqual({ when: 'wait', template: null, nextBlock: null });
    expect(diagnosis.primary.steps[0]?.text).toEqual({
      code: 'diagnosis.step.wait',
      params: { minutes: 5 },
    });
  });

  it('claude-cockpit#8 : le worker ne se lance pas, le board n’a pas de dossier de travail', () => {
    const diagnosis = diagnose(incidentInput('spawn'));
    expect(diagnosis.primary).toMatchObject({
      code: 'spawn_failed',
      actor: 'you_factory',
      cause: { state: 'present' },
    });
    expect(diagnosis.primary.evidence[0]?.quote).toMatch(
      /^workspace: task t_2fe761e4 has workspace_kind=worktree but no workspace_path/,
    );
    expect(diagnosis.primary.steps[0]?.text.code).toBe('diagnosis.step.fixWorkspace');
    expect(diagnosis.unblock.when).toBe('after_fix');
  });

  it('claude-cockpit#8 : le fournisseur muet 669 s, puis toute la chaîne de repli en échec', () => {
    const stalled = diagnose(incidentInput('stalled'));
    expect(stalled.primary).toMatchObject({ code: 'provider_unavailable', runIds: [15] });
    expect(stalled.primary.summary.params).toEqual({ mode: 'stalled', seconds: 669 });
    const failing = diagnose(incidentInput('failing'));
    expect(failing.primary).toMatchObject({ code: 'provider_unavailable', runIds: [20] });
    expect(failing.primary.summary.params).toEqual({ mode: 'failing', seconds: null });
    expect(failing.runs.map((run) => run.text.code)).toEqual(['diagnosis.run.providerUnavailable']);
  });

  it('claude-cockpit#8 (rework) : le contrôle de PR d’Hermès ne joint pas GitHub', () => {
    const diagnosis = diagnose(incidentInput('prInfra'));
    expect(diagnosis.primary).toMatchObject({
      code: 'pr_acceptance_infra',
      actor: 'you_factory',
      runIds: [27, 28],
    });
    expect(diagnosis.primary.steps[0]?.text.code).toBe('diagnosis.step.updateGh');
    // La question de la gate et sa sortie sans appel kanban en sont les conséquences.
    expect(codes(diagnosis)).not.toContain('question');
    expect(codes(diagnosis)).not.toContain('stopped_after_refusals');
    expect(diagnosis.unblock.when).toBe('after_fix');
  });

  it('claude-cockpit#42 (PR 2b) : aucun check requis sur le dépôt, la gate ne peut pas valider', () => {
    const diagnosis = diagnose(incidentInput('prChecks'));
    expect(diagnosis.primary).toMatchObject({
      code: 'pr_acceptance_missing',
      actor: 'you_factory',
    });
    expect(diagnosis.primary.why.params).toEqual({ checks: true });
    expect(diagnosis.primary.steps[0]?.text.code).toBe('diagnosis.step.configureChecks');
  });

  it('claude-cockpit#42 (PR 2b) : deux blocages identiques, la carte est en triage', () => {
    const diagnosis = diagnose(incidentInput('triage'));
    expect(diagnosis.primary.code).toBe('triage_loop');
    expect(codes(diagnosis)).not.toContain('question');
    expect(diagnosis.unblock).toEqual({ when: 'not_unblockable', template: null, nextBlock: null });
  });

  it('claude-cockpit#42 (PR 2a) : la carte prête, retenue par la garde active_pr, à relayer', () => {
    const diagnosis = diagnose(incidentInput('held', { owner: 'coder' }));
    expect(diagnosis.primary.code).toBe('held_active_pr');
    expect(diagnosis.primary.summary.params).toEqual({ minutes: 40 });
    expect(diagnosis.primary.steps[0]?.command).toBe(
      'hermes kanban --board factory reassign t_04382be9 scribe --reason "relais active_pr" && hermes kanban --board factory reassign t_04382be9 coder --reason "reprise sur la PR"',
    );
    expect(diagnosis.unblock.when).toBe('not_unblockable');
  });
});
