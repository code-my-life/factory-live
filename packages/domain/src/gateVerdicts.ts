import type { Board, Comment, Run, Task } from './hermes.ts';

/*
 * La gate scriptée de la factory (ADR 0015 de hermes-software-factory) : une voie de contrôle, pas un agent. Elle ne
 * laisse aucun run ; ses verdicts sont des commentaires signés `factory-gate`, au début fixe :
 *   « ✅ Gate verte sur `<sha>` (<URL de la PR>) : … »   « ❌ Gate rouge sur `<sha>` (PR #<n>), règle … »
 * Rien d'autre n'est lu de ces commentaires. Une carte d'implémentation verte reste en revue jusqu'à la fusion de sa
 * PR : elle attend alors l'approbation humaine sur GitHub.
 */

/** La voie de la gate scriptée : le relecteur imposé par coder-guard, jamais un profil. */
export const GATE_LANE = 'factory-gate';

export interface ScriptedVerdict {
  taskId: string;
  commentId: number;
  passed: boolean;
  /** Le sha jugé, tel que le commentaire le cite (7 caractères au moins). */
  sha: string;
  /** La PR, que le verdict vert cite. */
  pullRequest: string | null;
  /** Secondes epoch. */
  at: number;
}

const VERDICT = /^(?:✅|❌) Gate (verte|rouge) sur `([0-9a-f]{7,40})`/u;
const PR_URL = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/;

/** Les verdicts de la gate scriptée, dans l'ordre des commentaires. */
export function scriptedVerdicts(comments: readonly Comment[]): ScriptedVerdict[] {
  return [...comments]
    .filter((comment) => comment.author === GATE_LANE)
    .sort((left, right) => left.id - right.id)
    .flatMap((comment) => {
      const found = VERDICT.exec(comment.body);
      if (!found) return [];
      return [
        {
          taskId: comment.taskId,
          commentId: comment.id,
          passed: found[1] === 'verte',
          sha: found[2] as string,
          pullRequest: PR_URL.exec(comment.body)?.[0] ?? null,
          at: comment.createdAt,
        },
      ];
    });
}

/** Les demandes de revue d'une carte (runs de l'implémenteur qui se terminent en `review_requested`). */
export function reviewRequests(board: Board, taskId: string): Run[] {
  return board.runs
    .filter((run) => run.taskId === taskId && run.outcome === 'review_requested')
    .sort((left, right) => left.id - right.id);
}

/**
 * Le vert de la gate qui attend l'approbation humaine : la carte est en revue, son dernier verdict est vert et
 * postérieur à sa dernière demande de revue (un nouveau tour de l'implémenteur le rend caduc).
 */
export function awaitingApproval(task: Task, board: Board): ScriptedVerdict | null {
  if (task.status !== 'review') return null;
  const last = scriptedVerdicts(board.comments ?? [])
    .filter((verdict) => verdict.taskId === task.id)
    .at(-1);
  if (!last?.passed) return null;
  const requested = reviewRequests(board, task.id).map((run) => run.endedAt ?? run.startedAt);
  return last.at >= Math.max(0, ...requested) ? last : null;
}
