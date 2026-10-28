import type { CardView } from '@factory-live/contracts';
import { describe, expect, it } from 'vitest';
import { railOrder } from './IssueGraph.tsx';

const card = (id: string, parents: string[] = []) => ({ id, parents }) as unknown as CardView;
const order = (cards: CardView[]) =>
  railOrder(cards).map(({ card: entry, parallel }) => `${entry.id}${parallel ? ' ∥' : ''}`);

describe('railOrder', () => {
  it('met chaque carte après ses parents, quel que soit l’ordre reçu', () => {
    expect(order([card('release', ['impl']), card('impl', ['brief']), card('brief')])).toEqual([
      'brief',
      'impl',
      'release',
    ]);
  });

  it('marque en parallèle les cartes sœurs, dans l’ordre de l’issue', () => {
    expect(
      order([
        card('brief'),
        card('impl-a', ['brief']),
        card('impl-b', ['brief']),
        card('release', ['impl-a', 'impl-b']),
      ]),
    ).toEqual(['brief', 'impl-a', 'impl-b ∥', 'release']);
  });

  it('ignore un parent hors de l’issue et ne boucle pas sur un cycle', () => {
    expect(order([card('impl', ['ailleurs']), card('watch', ['impl'])])).toEqual(['impl', 'watch']);
    expect(order([card('a', ['b']), card('b', ['a'])])).toHaveLength(2);
  });
});
