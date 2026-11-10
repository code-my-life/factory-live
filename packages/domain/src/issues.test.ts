import { describe, expect, it } from 'vitest';
import {
  gateLaneOf,
  groupByIssue,
  issueStationOf,
  issueStatusOf,
  issueTypeOf,
  lineStationOf,
  profileStation,
} from './issues.ts';
import type { DeliveryFacts } from './issues.ts';
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

describe('lineStationOf', () => {
  const runs = [aRun({ id: 1, taskId: 't_impl', outcome: 'review_requested', endedAt: 1_500 })];
  const green = {
    id: 1,
    taskId: 't_impl',
    author: 'factory-gate',
    body: '✅ Gate verte sur `56045fb` (https://github.com/o/r/pull/9) : en attente',
    createdAt: 2_000,
  };
  const pr = (patch: Partial<DeliveryFacts> = {}): DeliveryFacts => ({
    state: 'open',
    reviewDecision: 'review_required',
    reviews: [],
    mergedAt: null,
    mainChecks: null,
    deployment: null,
    ...patch,
  });
  const atGreen = (delivery: DeliveryFacts | null) => {
    const tasks = [brief({ status: 'done' }), impl({ status: 'review' }), release()];
    return lineStationOf(tasks, board(tasks, { runs, comments: [green] }), delivery);
  };
  const shipped = (delivery: DeliveryFacts | null) => {
    const tasks = [
      brief({ status: 'done' }),
      impl({ status: 'done' }),
      release({ status: 'done' }),
    ];
    return lineStationOf(tasks, board(tasks), delivery);
  };
  const releasing = (delivery: DeliveryFacts | null) => {
    const tasks = [
      brief({ status: 'done' }),
      impl({ status: 'done' }),
      release({ status: 'running' }),
    ];
    return lineStationOf(tasks, board(tasks), delivery);
  };

  it("la station suit Ta revue, Fusion, CI de main puis Déploiement d'après la PR, main et le déploiement", () => {
    expect(atGreen(pr())).toBe('review');
    expect(atGreen(pr({ reviewDecision: 'approved' }))).toBe('merge');
    expect(releasing(pr({ state: 'merged', mergedAt: 3_000, mainChecks: 'pending' }))).toBe('ci');
    expect(
      shipped(
        pr({ state: 'merged', mergedAt: 3_000, mainChecks: 'success', deployment: 'pending' }),
      ),
    ).toBe('deploy');
    expect(
      shipped(
        pr({ state: 'merged', mergedAt: 3_000, mainChecks: 'success', deployment: 'success' }),
      ),
    ).toBe('done');
  });

  it('sans déploiement, main verte mène à Terminé ; main rouge renvoie la PR de revert à Ta revue', () => {
    expect(shipped(pr({ state: 'merged', mergedAt: 3_000, mainChecks: 'success' }))).toBe('done');
    expect(releasing(pr({ state: 'merged', mergedAt: 3_000, mainChecks: 'failure' }))).toBe(
      'review',
    );
  });

  it('une issue livrée sans aucun contrôle sur main est terminée', () => {
    expect(shipped(pr({ state: 'merged', mergedAt: 3_000, mainChecks: 'none' }))).toBe('done');
  });

  it('une release en cours sans contrôle sur main reste en CI de main', () => {
    expect(releasing(pr({ state: 'merged', mergedAt: 3_000, mainChecks: 'none' }))).toBe('ci');
  });

  it('une issue livrée sans contrôle sur main dont le déploiement est inachevé reste au Déploiement', () => {
    const merged = { state: 'merged', mergedAt: 3_000, mainChecks: 'none' } as const;
    expect(shipped(pr({ ...merged, deployment: 'pending' }))).toBe('deploy');
    expect(shipped(pr({ ...merged, deployment: 'failure' }))).toBe('deploy');
    expect(shipped(pr({ ...merged, deployment: 'success' }))).toBe('done');
    expect(shipped(pr({ ...merged, deployment: 'none' }))).toBe('done');
  });

  it('sans GitHub, le vert de la gate attend à Ta revue et la release faite est terminée', () => {
    expect(atGreen(null)).toBe('review');
    expect(shipped(null)).toBe('done');
  });

  it('une carte de diagnostic ouverte met l’issue sur la branche Diagnostic', () => {
    const diagnostic = aTask({
      id: 't_diag',
      title: 'diagnostic claude-cockpit#52 : bouton Détails',
      status: 'running',
    });
    const tasks = [brief({ status: 'done' }), diagnostic];
    expect(lineStationOf(tasks, board(tasks), null)).toBe('diagnostic');
  });

  it('les autres étapes restent celles du kanban', () => {
    const tasks = [brief({ status: 'ready' })];
    expect(lineStationOf(tasks, board(tasks), null)).toBe('intake');
    const archived = [brief({ status: 'archived' }), impl({ status: 'archived' })];
    expect(lineStationOf(archived, board(archived), null)).toBe('stopped');
  });
});

describe('gateLaneOf', () => {
  it('une issue Tests passe la gate par la preuve des sabotages', () => {
    expect(gateLaneOf(issueTypeOf([{ name: 'factory' }, { name: 'type:tests' }]))).toBe('sabotage');
  });

  it('chaque type a sa preuve ; le diagnostic n’en a pas, une issue sans type passe le fail-first', () => {
    expect(gateLaneOf('bug')).toBe('failfirst');
    expect(gateLaneOf('interface')).toBe('failfirst');
    expect(gateLaneOf('fonctionnalite')).toBe('failfirst');
    expect(gateLaneOf('maintenance')).toBe('invariance');
    expect(gateLaneOf('documentation')).toBe('documents');
    expect(gateLaneOf('diagnostic')).toBeNull();
    expect(gateLaneOf(null)).toBe('failfirst');
  });

  it('une issue type:skill passe par la voie skill de la gate', () => {
    const type = issueTypeOf([{ name: 'factory' }, { name: 'type:skill' }]);
    expect(type).toBe('skill');
    expect(gateLaneOf(type)).toBe('skill');
  });

  it('le type se lit sur l’étiquette type:*, rien sans elle', () => {
    expect(issueTypeOf([{ name: 'type:fonctionnalite' }])).toBe('fonctionnalite');
    expect(issueTypeOf([{ name: 'type:inconnu' }, { name: 'bug' }])).toBeNull();
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
