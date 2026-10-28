import type { CardView } from '@factory-live/contracts';
import { describe, expect, it } from 'vitest';
import { shortCardTitle } from './cardText.ts';

function card(title: string, kind: CardView['kind'] = 'impl'): CardView {
  return {
    id: 't_00000000',
    title,
    kind,
    status: 'todo',
    assignee: 'coder',
    station: 'implementation',
    blockKind: null,
    blockReason: null,
    parents: [],
    skills: [],
    runs: [],
    changedFiles: [],
    testsPassed: null,
    testsTotal: null,
  };
}

describe('shortCardTitle', () => {
  it("retire le type et la clé d'issue, déjà affichés par le nœud", () => {
    expect(shortCardTitle(card('impl claude-cockpit#71 : regrouper les cartes par projet'))).toBe(
      'regrouper les cartes par projet',
    );
    expect(shortCardTitle(card('cv-site#47 : Formulaire de contact', 'brief'))).toBe(
      'Formulaire de contact',
    );
  });

  it('donne un titre parlant à une release sans titre propre', () => {
    expect(shortCardTitle(card('release claude-cockpit#71', 'release'))).toBe(
      'Merge, tag et surveillance de main',
    );
  });
});
