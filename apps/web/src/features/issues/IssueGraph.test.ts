import type { CardView } from '@factory-live/contracts';
import { describe, expect, it } from 'vitest';
import { cardStages } from './IssueGraph.tsx';

const card = (id: string, parents: string[] = []) => ({ id, parents }) as unknown as CardView;
const stages = (cards: CardView[]) => cardStages(cards).map((stage) => stage.map(({ id }) => id));

describe('cardStages', () => {
  it('range chaque carte après ses parents, quel que soit l’ordre reçu', () => {
    expect(stages([card('release', ['impl']), card('impl', ['brief']), card('brief')])).toEqual([
      ['brief'],
      ['impl'],
      ['release'],
    ]);
  });

  it('met dans le même rang les cartes menées en même temps', () => {
    expect(
      stages([
        card('brief'),
        card('impl-a', ['brief']),
        card('impl-b', ['brief']),
        card('release', ['impl-a', 'impl-b']),
      ]),
    ).toEqual([['brief'], ['impl-a', 'impl-b'], ['release']]);
  });

  it('ignore un parent hors de l’issue et ne boucle pas sur un cycle', () => {
    expect(stages([card('impl', ['ailleurs']), card('watch', ['impl'])])).toEqual([
      ['impl'],
      ['watch'],
    ]);
    expect(stages([card('a', ['b']), card('b', ['a'])]).flat()).toHaveLength(2);
  });
});
