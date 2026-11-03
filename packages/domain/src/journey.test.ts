import { describe, expect, it } from 'vitest';
import { aRun, aTask } from './fixtures.test-helpers.ts';
import type { Board, Comment, Task } from './hermes.ts';
import type { DeliveryFacts } from './issues.ts';
import { journeyOf } from './journey.ts';

function board(tasks: Task[], patch: Partial<Board> = {}): Board {
  return { tasks, runs: [], events: [], links: [], ...patch };
}

const brief = aTask({
  id: 't_brief',
  title: 'cv-site#47 : Formulaire',
  status: 'done',
  createdAt: 100,
});
const impl = (patch: Partial<Task> = {}) =>
  aTask({ id: 't_impl', title: 'impl cv-site#47 : validation', status: 'done', ...patch });
const release = (patch: Partial<Task> = {}) =>
  aTask({ id: 't_rel', title: 'release cv-site#47', status: 'done', ...patch });

const verdict = (id: number, passed: boolean, at: number): Comment => ({
  id,
  taskId: 't_impl',
  author: 'factory-gate',
  body: passed
    ? '✅ Gate verte sur `56045fb` (https://github.com/o/r/pull/9) : en attente'
    : '❌ Gate rouge sur `56045fb` (PR #9), règle Couverture',
  createdAt: at,
});

const delivery = (patch: Partial<DeliveryFacts> = {}): DeliveryFacts => ({
  state: 'merged',
  reviewDecision: 'approved',
  reviews: [],
  mergedAt: null,
  mainChecks: null,
  deployment: null,
  ...patch,
});

const stations = (steps: ReturnType<typeof journeyOf>) =>
  steps.map((step) => (step.outcome ? `${step.station}:${step.outcome}` : step.station));

describe('journeyOf', () => {
  const runs = [
    aRun({ id: 1, taskId: 't_brief', profile: 'coordinator', startedAt: 200 }),
    aRun({
      id: 2,
      taskId: 't_impl',
      profile: 'coder',
      startedAt: 300,
      outcome: 'review_requested',
    }),
  ];

  it("le trajet compte deux gates rouges, une demande de changements et un revert dans l'ordre", () => {
    const tasks = [brief, impl(), release({ status: 'blocked' })];
    const comments = [verdict(1, false, 400), verdict(2, false, 500), verdict(3, true, 600)];
    const facts = delivery({
      reviews: [
        { state: 'changes_requested', at: 700 },
        { state: 'approved', at: 900 },
      ],
      mergedAt: 1_000,
      mainChecks: 'failure',
    });
    const comments2 = [...comments, verdict(4, true, 800)];
    const steps = journeyOf(
      tasks,
      board(tasks, { runs, comments: comments2 }),
      facts,
      'failfirst',
      'review',
    );
    expect(stations(steps)).toEqual([
      'intake',
      'brief',
      'implementation',
      'gate:red',
      'implementation',
      'gate:red',
      'implementation',
      'gate:ok',
      'review:changes',
      'implementation',
      'gate:ok',
      'review:ok',
      'merge',
      'ci:red',
      'review',
    ]);
    expect(
      steps.filter((step) => step.station === 'gate').every((step) => step.lane === 'failfirst'),
    ).toBe(true);
  });

  it('une issue livrée finit par la CI de main, le déploiement puis Terminé', () => {
    const tasks = [brief, impl(), release()];
    const facts = delivery({
      reviews: [{ state: 'approved', at: 700 }],
      mergedAt: 800,
      mainChecks: 'success',
      deployment: 'success',
    });
    const steps = journeyOf(
      tasks,
      board(tasks, { runs, comments: [verdict(1, true, 600)] }),
      facts,
      'invariance',
      'done',
    );
    expect(stations(steps)).toEqual([
      'intake',
      'brief',
      'implementation',
      'gate:ok',
      'review:ok',
      'merge',
      'ci:ok',
      'deploy',
      'done',
    ]);
  });

  it('le trajet finit toujours sur la station courante', () => {
    const tasks = [brief, impl({ status: 'review' }), release({ status: 'todo' })];
    const steps = journeyOf(tasks, board(tasks, { runs }), null, 'sabotage', 'gate');
    expect(stations(steps)).toEqual(['intake', 'brief', 'implementation', 'gate']);
    expect(steps.at(-1)?.lane).toBe('sabotage');
  });

  it('un diagnostic passe du brief à sa branche, puis à Terminé, sans gate ni PR', () => {
    const diagnostic = aTask({
      id: 't_diag',
      title: 'diagnostic cv-site#47 : bouton',
      status: 'done',
    });
    const tasks = [brief, diagnostic];
    const diagRuns = [
      aRun({ id: 1, taskId: 't_brief', profile: 'coordinator', startedAt: 200 }),
      aRun({ id: 3, taskId: 't_diag', profile: 'coder', startedAt: 300 }),
    ];
    const steps = journeyOf(tasks, board(tasks, { runs: diagRuns }), null, null, 'done');
    expect(stations(steps)).toEqual(['intake', 'brief', 'diagnostic', 'done']);
  });
});
