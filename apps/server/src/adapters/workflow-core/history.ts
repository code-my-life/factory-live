import type { CoreItem } from '@factory-live/contracts/workflow-core';
import type { Board, Comment } from '@factory-live/domain';
import type { HistoryPort, KanbanDelta } from '../../application/ports.ts';
import { boardOf, itemsOfBoard } from './cards.ts';

/**
 * factory-live's own history on the core's side (#63, ADR 0019): every item the core serves is kept in
 * factory-live's base, its last full state, and stays there once Hermes purged it. The code line's board is
 * the core's current items, then the items it no longer serves, from the history. It is not a copy of the
 * kanban: only what the core served, in the core's form, and the mirror poured once at the first start.
 */
/** The statuses of a finished card, the only ones Hermes purges. */
const FINISHED = new Set(['done', 'archived']);

export class CoreHistory {
  private readonly store: HistoryPort;
  private readonly now: () => number;

  constructor(store: HistoryPort, now: () => number) {
    this.store = store;
    this.now = now;
  }

  /** At the first start on the core's side: the kanban mirror goes into the history, once. */
  seed(workflow: string, mirror: Board & { comments: Comment[] }): boolean {
    const items = itemsOfBoard(mirror).map((item) => ({ id: item.id, state: item }));
    return this.store.seedHistory(workflow, items, this.now());
  }

  /** Items read from the core; `complete` for a full read, where the others are gone. */
  record(workflow: string, items: readonly CoreItem[], complete: boolean): void {
    this.store.recordItems(
      workflow,
      items.map((item) => ({ id: item.id, state: item })),
      this.now(),
      complete,
    );
  }

  /** The board of the core's current items, then the items gone from the core, from the history. */
  withGone(workflow: string, board: KanbanDelta): KanbanDelta {
    const current = new Set(board.tasks.map((task) => task.id));
    // Only a finished card is kept: Hermes purges finished cards; a card gone unfinished (deleted, or a
    // journal rebuilt without it) leaves the line, as a full read of the core says (#57).
    const gone = this.store
      .historyItems(workflow)
      .filter((item) => item.goneAt !== null && !current.has(item.id))
      .map((item) => item.state as CoreItem)
      .filter((item) => FINISHED.has(item.status));
    if (gone.length === 0) return board;
    const past = boardOf(gone);
    return {
      // In the core's order: by creation, then by id.
      tasks: [...board.tasks, ...past.tasks].sort(
        (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id),
      ),
      runs: [...board.runs, ...past.runs].sort((left, right) => left.id - right.id),
      links: [...board.links, ...past.links],
      events: [...board.events, ...past.events].sort((left, right) => left.id - right.id),
      comments: [...board.comments, ...past.comments].sort((left, right) => left.id - right.id),
    };
  }
}
