import { describe, expect, it } from 'vitest';
import { groupByIssue, issueStationOf, issueStatusOf, profileStation } from './issues.ts';
import { aLink, aRun, aTask, anEvent } from './fixtures.test-helpers.ts';
import type { Board, Task } from './hermes.ts';

function board(tasks: Task[], patch: Partial<Board> = {}): Board {
  return { tasks, runs: [], events: [], links: [], ...patch };
}

const brief = (patch: Partial<Task> = {}) =>
  aTask({ id: 't_brief', title: 'cv-site#47 : Formulaire', ...patch });
const impl = (patch: Partial<Task> = {}) =>
  aTask({ id: 't_impl', title: 'impl cv-site#47 : validation', ...patch });
const release = (patch: Partial<Task> = {}) =>
  aTask({ id: 't_rel', title: 'release cv-site#47', ...patch });

describe('groupByIssue', () => {
  it('regroupe brief, impl et release sous la même issue', () => {
    const groups = groupByIssue(board([brief(), impl(), release()]));
    expect([...groups.keys()]).toEqual(['cv-site#47']);
    expect(groups.get('cv-site#47')?.map((task) => task.id)).toEqual([
      't_brief',
      't_impl',
      't_rel',
    ]);
  });

  it('rattache une carte sans référence à l’issue de sa carte parente', () => {
    const orphan = aTask({ id: 't_child', title: 'Mettre à jour la doc' });
    const groups = groupByIssue(board([brief(), orphan], { links: [aLink('t_brief', 't_child')] }));
    expect(groups.get('cv-site#47')?.map((task) => task.id)).toContain('t_child');
  });

  it('laisse de côté les cartes de watch', () => {
    const watch = aTask({ id: 't_watch', title: 'watch 2026-10-28 : 2 PR ouvertes' });
    expect(groupByIssue(board([watch])).size).toBe(0);
  });
});

describe('issueStationOf', () => {
  const at = (tasks: Task[], patch: Partial<Board> = {}) =>
    issueStationOf(tasks, board(tasks, patch));

  it('intake tant que le brief n’a jamais tourné', () => {
    expect(at([brief({ status: 'ready' })])).toBe('intake');
  });

  it('brief dès qu’un coordinateur l’a pris, ou s’il est bloqué', () => {
    expect(
      at([brief({ status: 'running' })], {
        runs: [aRun({ taskId: 't_brief', profile: 'coordinator' })],
      }),
    ).toBe('brief');
    expect(
      at([brief({ status: 'blocked' })], {
        runs: [aRun({ taskId: 't_brief', status: 'blocked' })],
      }),
    ).toBe('brief');
  });

  it('implémentation pendant le run de l’implémenteur', () => {
    const tasks = [
      brief({ status: 'done' }),
      impl({ status: 'running', currentRunId: 5 }),
      release(),
    ];
    expect(at(tasks, { runs: [aRun({ id: 5, taskId: 't_impl', profile: 'coder-claude' })] })).toBe(
      'implementation',
    );
  });

  it('gate quand la carte impl attend ou subit la revue', () => {
    expect(at([brief({ status: 'done' }), impl({ status: 'review' }), release()])).toBe('gate');
    const tasks = [
      brief({ status: 'done' }),
      impl({ status: 'running', currentRunId: 6 }),
      release(),
    ];
    const runs = [aRun({ id: 6, taskId: 't_impl', profile: 'gate' })];
    expect(at(tasks, { runs })).toBe('gate');
  });

  it('release quand la gate scriptée a rendu son vert : la carte attend l’approbation en revue', () => {
    const tasks = [brief({ status: 'done' }), impl({ status: 'review' }), release()];
    const runs = [aRun({ id: 1, taskId: 't_impl', outcome: 'review_requested', endedAt: 1_500 })];
    const green = {
      id: 1,
      taskId: 't_impl',
      author: 'factory-gate',
      body: '✅ Gate verte sur `56045fb` (https://github.com/o/r/pull/9) : en attente',
      createdAt: 2_000,
    };
    expect(at(tasks, { runs, comments: [green] })).toBe('release');
    expect(
      at(tasks, {
        runs,
        comments: [{ ...green, body: '❌ Gate rouge sur `56045fb` (PR #9), règle CI' }],
      }),
    ).toBe('gate');
  });

  it('reste en implémentation si la gate demande des changements (carte repartie en ready)', () => {
    const tasks = [brief({ status: 'done' }), impl({ status: 'ready' }), release()];
    const events = [anEvent({ taskId: 't_impl', kind: 'changes_requested' })];
    expect(at(tasks, { events })).toBe('implementation');
  });

  it('release quand toutes les impl sont faites', () => {
    expect(
      at([brief({ status: 'done' }), impl({ status: 'done' }), release({ status: 'blocked' })]),
    ).toBe('release');
  });

  it('terminé quand la release est faite, arrêté quand tout est archivé sans release faite', () => {
    expect(
      at([brief({ status: 'done' }), impl({ status: 'done' }), release({ status: 'done' })]),
    ).toBe('done');
    expect(at([brief({ status: 'archived' }), impl({ status: 'archived' })])).toBe('stopped');
  });

  it('la plus en retard des impl fixe l’étape', () => {
    const second = aTask({ id: 't_impl2', title: 'impl cv-site#47 : migration', status: 'ready' });
    expect(at([brief({ status: 'done' }), impl({ status: 'review' }), second, release()])).toBe(
      'implementation',
    );
  });
});

describe('issueStatusOf', () => {
  const card = (status: Task['status']) => aTask({ status });

  it('reprend la station pour une issue finie ou arrêtée', () => {
    expect(issueStatusOf([card('archived')], 'done', 0)).toBe('done');
    expect(issueStatusOf([card('archived')], 'stopped', 2)).toBe('stopped');
  });

  it('une intervention ouverte prime : l’issue attend Clément', () => {
    expect(issueStatusOf([card('running'), card('blocked')], 'implementation', 1)).toBe(
      'waiting_human',
    );
  });

  it('sinon bloquée, puis active, puis en attente de son tour', () => {
    expect(issueStatusOf([card('running'), card('blocked')], 'implementation', 0)).toBe('blocked');
    expect(issueStatusOf([card('done'), card('running')], 'gate', 0)).toBe('active');
    expect(issueStatusOf([card('ready'), card('done')], 'implementation', 0)).toBe('queued');
  });
});

describe('profileStation', () => {
  it.each([
    ['coordinator', 'brief'],
    ['coordinator-claude', 'brief'],
    ['coder', 'implementation'],
    ['coder-opencode', 'implementation'],
    ['scribe', 'implementation'],
    ['gate-claude', 'gate'],
    ['release', 'release'],
    ['tool-setup', 'side'],
    ['default', 'side'],
  ])('%s est à la station %s', (profile, station) => {
    expect(profileStation(profile)).toBe(station);
  });
});
