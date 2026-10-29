import { describe, expect, it } from 'vitest';
import { awaitingApproval, scriptedVerdicts } from './gateVerdicts.ts';
import { aRun, aTask } from './fixtures.test-helpers.ts';
import type { Board, Comment } from './hermes.ts';

/** Le début des commentaires que rend la gate scriptée de la factory (factory-gate.py) ; la suite n'est pas lue. */
const GREEN =
  "Gate verte sur `56045fb` (https://github.com/code-my-life/factory-live/pull/9) : en attente de l'approbation sur GitHub ; la carte se termine à la fusion.";
const RED =
  'Gate rouge sur `abc1234` (PR #9), règle Fail-first : « SettingsPage shows the server version » passe déjà sur la base `873bda7`';

function comment(id: number, body: string, patch: Partial<Comment> = {}): Comment {
  return { id, taskId: 't_impl', author: 'factory-gate', body, createdAt: 2_000 + id, ...patch };
}

const IMPL = aTask({ id: 't_impl', title: 'impl factory-live#9 : version', status: 'review' });
const REQUEST = aRun({
  id: 1,
  taskId: 't_impl',
  outcome: 'review_requested',
  startedAt: 1_000,
  endedAt: 1_500,
});

function board(comments: Comment[], patch: Partial<Board> = {}): Board {
  return { tasks: [IMPL], runs: [REQUEST], events: [], links: [], comments, ...patch };
}

describe('scriptedVerdicts', () => {
  it('lit le verdict, le sha et la PR des seuls commentaires de factory-gate', () => {
    const verdicts = scriptedVerdicts([
      comment(2, `❌ ${RED}`),
      comment(3, `✅ ${GREEN}`),
      comment(4, `✅ ${GREEN}`, { author: 'coder' }),
      comment(5, '⚠️ Gate : impossible de trancher pour l’instant (GitHub injoignable).'),
    ]);
    expect(verdicts).toEqual([
      {
        taskId: 't_impl',
        commentId: 2,
        passed: false,
        sha: 'abc1234',
        pullRequest: null,
        at: 2_002,
      },
      {
        taskId: 't_impl',
        commentId: 3,
        passed: true,
        sha: '56045fb',
        pullRequest: 'https://github.com/code-my-life/factory-live/pull/9',
        at: 2_003,
      },
    ]);
  });
});

describe('awaitingApproval', () => {
  it('le dernier verdict vert d’une carte en revue attend l’approbation', () => {
    expect(
      awaitingApproval(IMPL, board([comment(2, `❌ ${RED}`), comment(3, `✅ ${GREEN}`)]))
        ?.commentId,
    ).toBe(3);
  });

  it('un rouge plus récent, ou une carte sortie de la revue, n’attend rien', () => {
    expect(
      awaitingApproval(IMPL, board([comment(2, `✅ ${GREEN}`), comment(3, `❌ ${RED}`)])),
    ).toBeNull();
    expect(
      awaitingApproval({ ...IMPL, status: 'ready' }, board([comment(3, `✅ ${GREEN}`)])),
    ).toBeNull();
  });

  it('un nouveau tour de l’implémenteur rend le vert caduc jusqu’au prochain verdict', () => {
    const again = aRun({
      id: 2,
      taskId: 't_impl',
      outcome: 'review_requested',
      startedAt: 2_100,
      endedAt: 2_200,
    });
    expect(
      awaitingApproval(IMPL, board([comment(3, `✅ ${GREEN}`)], { runs: [REQUEST, again] })),
    ).toBeNull();
  });
});
