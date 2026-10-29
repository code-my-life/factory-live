import { describe, expect, it } from 'vitest';
import { branchOf, interventionsOf, pullRequestUrl } from './interventions.ts';
import type { InterventionContext } from './interventions.ts';
import { aRun, aTask, anEvent } from './fixtures.test-helpers.ts';
import type { Board, Task, TaskEvent } from './hermes.ts';
import { message } from './messages.ts';

const ctx: InterventionContext = {
  now: 100_000,
  board: 'factory',
  owner: 'code-my-life',
  dashboardUrl: 'https://machine.tailnet.ts.net:9443',
  heldAfterSeconds: 1_800,
};

function run(tasks: Task[], events: TaskEvent[] = [], patch: Partial<Board> = {}) {
  return interventionsOf({ tasks, runs: [], events, links: [], ...patch }, ctx);
}

const blocked = (kind: Task['blockKind'], patch: Partial<Task> = {}) =>
  aTask({
    id: 't_b',
    title: 'cv-site#49 : Page Projets',
    status: 'blocked',
    blockKind: kind,
    assignee: 'coordinator',
    ...patch,
  });
const blockedEvent = (reason: string, kind: string | null, id = 10) =>
  anEvent({ id, taskId: 't_b', kind: 'blocked', payload: { reason, kind }, createdAt: 90_000 });

describe('interventionsOf', () => {
  it('une décision attendue : push, déblocage depuis l’app, question entière', () => {
    const [found] = run(
      [blocked('needs_input')],
      [blockedEvent('Carte UI sans maquette jointe.\nDeux options…', 'needs_input')],
    );
    expect(found).toMatchObject({
      kind: 'needs_input',
      severity: 'critical',
      push: true,
      issueKey: 'cv-site#49',
      title: 'Carte UI sans maquette jointe.',
      openedAt: 90_000,
      eventId: 10,
    });
    expect(found?.question).toContain('Deux options');
    expect(found?.actions).toContainEqual({ kind: 'unblock' });
  });

  it('un outil manquant et un échec passager poussent aussi', () => {
    expect(
      run([blocked('capability')], [blockedEvent('gh absent', 'capability')])[0],
    ).toMatchObject({ kind: 'capability', push: true });
    const transient = run(
      [blocked('transient')],
      [blockedEvent('lane CLI en échec deux fois', 'transient')],
    )[0];
    expect(transient).toMatchObject({ kind: 'transient', push: true });
    expect(transient?.actions.some((action) => action.kind === 'copy')).toBe(true);
  });

  it('un abandon du disjoncteur prime sur le blocage qu’il provoque', () => {
    const events = [
      blockedEvent('gave_up', null, 10),
      anEvent({
        id: 11,
        taskId: 't_b',
        kind: 'gave_up',
        payload: { failures: 2, error: 'Iteration budget exhausted (150/150)' },
        createdAt: 90_100,
      }),
    ];
    expect(run([blocked(null)], events)[0]).toMatchObject({
      kind: 'gave_up',
      push: true,
      title: message('intervention.title.gaveUp', { failures: 2 }),
    });
  });

  it('« prêt à merger » sur une release est une PR à approuver, sans push', () => {
    const release = aTask({
      id: 't_rel',
      title: 'release claude-cockpit#68',
      status: 'blocked',
      blockKind: 'needs_input',
    });
    const impl = aTask({ id: 't_impl', title: 'impl claude-cockpit#68 : tag' });
    const events = [
      anEvent({
        id: 3,
        taskId: 't_rel',
        kind: 'blocked',
        payload: { reason: 'Prêt à merger claude-cockpit#74', kind: 'needs_input' },
        createdAt: 95_000,
      }),
    ];
    const runs = [
      aRun({
        taskId: 't_impl',
        metadata: { pr_url: 'https://github.com/code-my-life/claude-cockpit/pull/74' },
      }),
    ];
    const [found] = interventionsOf({ tasks: [impl, release], runs, events, links: [] }, ctx);
    expect(found).toMatchObject({ kind: 'pr_approval', push: false, severity: 'info' });
    expect(found?.actions).toEqual([
      {
        kind: 'link',
        label: message('intervention.action.approvePr'),
        url: 'https://github.com/code-my-life/claude-cockpit/pull/74',
      },
    ]);
  });

  it('main rouge après merge : visible, sans push', () => {
    const release = aTask({
      id: 't_rel',
      title: 'release claude-cockpit#68',
      status: 'blocked',
      blockKind: null,
    });
    const events = [
      anEvent({
        taskId: 't_rel',
        kind: 'blocked',
        payload: { reason: 'Main rouge après le merge : workflow Tests en échec', kind: null },
      }),
    ];
    expect(run([release], events)[0]).toMatchObject({ kind: 'main_red', push: false });
  });

  it('boucle de blocage : la carte est en triage, procédure à copier, pas de déblocage', () => {
    const task = aTask({ id: 't_b', title: 'impl cv-site#49 : filtres', status: 'triage' });
    const events = [
      anEvent({
        taskId: 't_b',
        kind: 'block_loop_detected',
        payload: { recurrences: 2, limit: 2 },
      }),
    ];
    const [found] = run([task], events);
    expect(found).toMatchObject({
      kind: 'triage_loop',
      push: true,
      title: message('intervention.title.triageLoop'),
      question: message('intervention.question.triageLoop'),
    });
    expect(found?.actions.some((action) => action.kind === 'unblock')).toBe(false);
    expect(found?.actions.map((action) => action.kind !== 'unblock' && action.label)).toEqual([
      message('intervention.action.dashboard'),
      message('intervention.action.showCard'),
    ]);
  });

  it('sans dashboard configuré, la boucle de blocage ne propose que la commande à copier', () => {
    const task = aTask({ id: 't_b', title: 'impl cv-site#49 : filtres', status: 'triage' });
    const events = [
      anEvent({
        taskId: 't_b',
        kind: 'block_loop_detected',
        payload: { recurrences: 2, limit: 2 },
      }),
    ];
    const [found] = interventionsOf(
      { tasks: [task], runs: [], events, links: [] },
      { ...ctx, dashboardUrl: null },
    );
    expect(found?.actions).toEqual([
      {
        kind: 'copy',
        label: message('intervention.action.showCard'),
        command: 'hermes kanban --board factory show t_b',
      },
    ]);
  });

  it('carte retenue par active_pr au-delà de 30 min, depuis la dernière prise', () => {
    const task = aTask({
      id: 't_h',
      title: 'impl cv-site#44 : liens',
      status: 'ready',
      assignee: 'coder',
    });
    const guarded = (id: number, createdAt: number) =>
      anEvent({
        id,
        taskId: 't_h',
        kind: 'respawn_guarded',
        payload: { reason: 'active_pr' },
        createdAt,
      });
    const tooRecent = run([task], [guarded(1, 99_000)]);
    expect(tooRecent).toEqual([]);
    const [held] = run([task], [guarded(1, 97_000), guarded(2, 99_900)]);
    expect(held).toMatchObject({
      kind: 'held_active_pr',
      push: true,
      openedAt: 97_000,
      eventId: null,
      title: message('intervention.title.held', { minutes: 50 }),
      question: message('intervention.question.held'),
    });
    const copy = held?.actions.find((action) => action.kind === 'copy');
    expect(copy?.kind === 'copy' ? copy.command : '').toContain('reassign t_h scribe');
    expect(copy?.kind === 'copy' ? copy.label : null).toEqual(
      message('intervention.action.relay', { owner: 'coder' }),
    );
  });

  it('un claim remet le compteur de la carte retenue à zéro', () => {
    const task = aTask({ id: 't_h', title: 'impl cv-site#44 : liens', status: 'ready' });
    const events = [
      anEvent({
        id: 1,
        taskId: 't_h',
        kind: 'respawn_guarded',
        payload: { reason: 'active_pr' },
        createdAt: 90_000,
      }),
      anEvent({ id: 2, taskId: 't_h', kind: 'claimed', createdAt: 95_000 }),
      anEvent({
        id: 3,
        taskId: 't_h',
        kind: 'respawn_guarded',
        payload: { reason: 'active_pr' },
        createdAt: 99_000,
      }),
    ];
    expect(run([task], events)).toEqual([]);
  });

  it('un blocage sans type reste visible mais sans push : ce n’est pas une question de l’agent', () => {
    const [found] = run([blocked(null)], [blockedEvent('Arrêt opérateur', null)]);
    expect(found).toMatchObject({
      kind: 'needs_input',
      severity: 'warning',
      push: false,
      title: 'Arrêt opérateur',
    });
    expect(found?.actions.map((action) => action.kind)).toEqual(['unblock', 'copy', 'link']);
  });

  it('sans raison donnée par l’agent, titre et question sont des codes que le client écrit', () => {
    const fallback = (kind: Task['blockKind']) => run([blocked(kind)], [blockedEvent('', kind)])[0];
    expect(fallback('needs_input')).toMatchObject({
      title: message('intervention.title.needsInput'),
      question: message('intervention.question.needsInput'),
    });
    expect(fallback('capability')).toMatchObject({
      title: message('intervention.title.capability'),
      question: message('intervention.question.capability'),
    });
    expect(fallback('transient')).toMatchObject({
      title: message('intervention.title.transient'),
      question: message('intervention.question.transient'),
    });
    expect(fallback('transient')?.actions[1]).toMatchObject({
      kind: 'copy',
      label: message('intervention.action.reassignCoder'),
    });
    expect(fallback(null)).toMatchObject({
      title: message('intervention.title.blocked'),
      question: message('intervention.question.blocked'),
    });
    expect(fallback(null)?.actions.slice(1)).toMatchObject([
      { kind: 'copy', label: message('intervention.action.showCard') },
      {
        kind: 'link',
        label: message('intervention.action.openIssue', { issueKey: 'cv-site#49' }),
        url: 'https://github.com/code-my-life/cv-site/issues/49',
      },
    ]);
    const gaveUp = run(
      [blocked(null)],
      [anEvent({ id: 12, taskId: 't_b', kind: 'gave_up', payload: {}, createdAt: 90_000 })],
    )[0];
    expect(gaveUp).toMatchObject({
      title: message('intervention.title.gaveUp', { failures: null }),
      question: message('intervention.question.gaveUp'),
    });
  });

  it('une release prête sans raison écrite : titre et question de secours, lien vers la PR', () => {
    const release = aTask({
      id: 't_rel',
      title: 'release claude-cockpit#68',
      status: 'blocked',
      blockKind: 'needs_input',
    });
    const [found] = run([release], [anEvent({ taskId: 't_rel', kind: 'blocked', payload: {} })]);
    expect(found).toMatchObject({
      kind: 'pr_approval',
      title: message('intervention.title.prReady'),
      question: message('intervention.question.prReady'),
    });
    expect(found?.actions).toEqual([
      {
        kind: 'link',
        label: message('intervention.action.openIssue', { issueKey: 'claude-cockpit#68' }),
        url: 'https://github.com/code-my-life/claude-cockpit/issues/68',
      },
    ]);
  });

  it('un blocage de dépendance n’est pas une intervention (reprise automatique)', () => {
    const task = aTask({
      id: 't_d',
      title: 'release cv-site#47',
      status: 'todo',
      blockKind: 'dependency',
    });
    expect(run([task], [anEvent({ taskId: 't_d', kind: 'dependency_wait' })])).toEqual([]);
  });

  it('donne un identifiant stable, pour ne notifier qu’une fois par blocage', () => {
    const tasks = [blocked('needs_input')];
    const events = [blockedEvent('Question', 'needs_input', 42)];
    expect(run(tasks, events)[0]?.id).toBe(run(tasks, events)[0]?.id);
    expect(run(tasks, events)[0]?.id).toBe('needs_input:t_b:42');
  });
});

describe('pullRequestUrl', () => {
  it('prend le lien de PR du dernier run des cartes, publié ou relevé, et rien d’autre', () => {
    const tasks = [aTask({ id: 't_impl' }), aTask({ id: 't_release' })];
    const board: Board = {
      tasks,
      events: [],
      links: [],
      runs: [
        aRun({ id: 1, taskId: 't_impl', metadata: { pr_url: 'https://github.com/o/r/pull/1' } }),
        aRun({
          id: 3,
          taskId: 't_release',
          metadata: { published_pr: 'https://github.com/o/r/pull/2' },
        }),
        aRun({ id: 2, taskId: 't_impl', metadata: { pr_url: 'pas un lien' } }),
        aRun({ id: 4, taskId: 't_autre', metadata: { pr_url: 'https://github.com/o/r/pull/9' } }),
      ],
    };
    expect(pullRequestUrl(tasks, board)).toBe('https://github.com/o/r/pull/2');
    expect(pullRequestUrl([aTask({ id: 't_seule' })], board)).toBeNull();
  });
});

describe('branchOf', () => {
  const card = (patch: Partial<Task> = {}) =>
    aTask({
      id: 't_665ba7d7',
      body: 'Brief\n- base_commit : origin/main\n- branch_name : fix/2-server-version-in-settings\n- tests',
      ...patch,
    });

  it('prend la branche déclarée, puis celle notée par le dernier run, puis celle du brief', () => {
    const runs = [
      aRun({ id: 191, taskId: 't_665ba7d7', metadata: {} }),
      aRun({ id: 192, taskId: 't_665ba7d7', metadata: { branch: 'fix/2-autre' } }),
    ];
    expect(branchOf(card({ branchName: 'feat/3-x' }), runs)).toBe('feat/3-x');
    expect(branchOf(card(), runs)).toBe('fix/2-autre');
    expect(branchOf(card(), runs.slice(0, 1))).toBe('fix/2-server-version-in-settings');
  });

  it('écarte ce qui ne peut pas être une branche git', () => {
    expect(branchOf(card({ body: '- branch_name : fix/2-a..b' }), [])).toBeNull();
    expect(branchOf(card({ body: '- branch_name : [fix] 2' }), [])).toBeNull();
    expect(branchOf(card({ body: 'pas de branche' }), [])).toBeNull();
  });
});
