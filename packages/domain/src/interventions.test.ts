import { describe, expect, it } from 'vitest';
import { branchOf, interventionsOf, pullRequestUrl } from './interventions.ts';
import type { InterventionContext } from './interventions.ts';
import { aRun, aTask, anEvent } from './fixtures.test-helpers.ts';
import type { Board, Task, TaskEvent } from './board.ts';
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

describe('interventionsOf', () => {
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

describe('vert de la gate scriptée', () => {
  const impl = aTask({ id: 't_impl', title: 'impl factory-live#9 : version', status: 'review' });
  const runs = [aRun({ id: 1, taskId: 't_impl', outcome: 'review_requested', endedAt: 1_500 })];
  const green = {
    id: 7,
    taskId: 't_impl',
    author: 'factory-gate',
    body: "✅ Gate verte sur `56045fb` (https://github.com/code-my-life/factory-live/pull/9) : en attente de l'approbation sur GitHub.",
    createdAt: 2_000,
  };

  it('ouvre « PR à approuver », avec le lien de la PR que cite le verdict', () => {
    const [found] = interventionsOf(
      { tasks: [impl], runs, events: [], links: [], comments: [green] },
      ctx,
    );
    expect(found).toMatchObject({
      kind: 'pr_approval',
      severity: 'info',
      cardId: 't_impl',
      openedAt: 2_000,
    });
    expect(found?.actions).toEqual([
      {
        kind: 'link',
        label: message('intervention.action.approvePr'),
        url: 'https://github.com/code-my-life/factory-live/pull/9',
      },
    ]);
  });

  it('rien sans vert, ni sur une carte repartie chez l’implémenteur', () => {
    const red = { ...green, body: '❌ Gate rouge sur `56045fb` (PR #9), règle CI : checks rouges' };
    expect(
      interventionsOf({ tasks: [impl], runs, events: [], links: [], comments: [red] }, ctx),
    ).toEqual([]);
    expect(
      interventionsOf(
        { tasks: [{ ...impl, status: 'ready' }], runs, events: [], links: [], comments: [green] },
        ctx,
      ),
    ).toEqual([]);
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
