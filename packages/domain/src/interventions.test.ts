import { describe, expect, it } from 'vitest';
import { interventionsOf, pullRequestUrl } from './interventions.ts';
import type { InterventionContext } from './interventions.ts';
import { aRun, aTask, anEvent } from './fixtures.test-helpers.ts';
import type { Board, Task, TaskEvent } from './hermes.ts';

const ctx: InterventionContext = {
  now: 100_000,
  board: 'factory',
  owner: 'code-my-life',
  dashboardUrl: 'https://desktop-gja56n4.tail40220c.ts.net:8443',
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
      title: 'Abandon après 2 échecs',
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
        label: 'Approuver la PR sur GitHub',
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
    expect(found).toMatchObject({ kind: 'triage_loop', push: true });
    expect(found?.actions.some((action) => action.kind === 'unblock')).toBe(false);
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
    expect(held).toMatchObject({ kind: 'held_active_pr', push: true, openedAt: 97_000 });
    const copy = held?.actions.find((action) => action.kind === 'copy');
    expect(copy?.kind === 'copy' ? copy.command : '').toContain('reassign t_h scribe');
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
