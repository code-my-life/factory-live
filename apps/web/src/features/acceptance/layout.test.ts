import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYOUT,
  loadLayout,
  move,
  normalizeLayout,
  placeOf,
  reorder,
  saveLayout,
  toggleCollapsed,
  toggleHalf,
  togglePin,
} from './layout.ts';

describe('disposition de la recette', () => {
  afterEach(() => window.localStorage.clear());

  it('par défaut, tout est visible dans l’ordre demandé ; les critères et les jumeaux sont repliés', () => {
    expect(DEFAULT_LAYOUT.order).toEqual([
      'criteria',
      'checks',
      'tests',
      'proofs',
      'threads',
      'twins',
    ]);
    expect(DEFAULT_LAYOUT.pinned).toEqual([]);
    expect(DEFAULT_LAYOUT.collapsed).toEqual(['criteria', 'twins']);
    expect(DEFAULT_LAYOUT.half).toEqual([]);
  });

  it('un widget passe en demi-largeur et revient en pleine largeur', () => {
    const half = toggleHalf(toggleHalf(DEFAULT_LAYOUT, 'checks'), 'tests');
    expect(half.half).toEqual(['checks', 'tests']);
    expect(toggleHalf(half, 'checks').half).toEqual(['tests']);
  });

  it('un widget épinglé passe en tête, après ceux déjà épinglés ; désépinglé, il mène les autres', () => {
    const one = togglePin(DEFAULT_LAYOUT, 'twins');
    expect(one.order).toEqual(['twins', 'criteria', 'checks', 'tests', 'proofs', 'threads']);
    const two = togglePin(one, 'tests');
    expect(two.order).toEqual(['twins', 'tests', 'criteria', 'checks', 'proofs', 'threads']);
    expect(two.pinned).toEqual(['twins', 'tests']);
    const back = togglePin(two, 'twins');
    expect(back.order).toEqual(['tests', 'twins', 'criteria', 'checks', 'proofs', 'threads']);
    expect(back.pinned).toEqual(['tests']);
  });

  it('un glisser ne fait pas passer un widget au-dessus des épinglés', () => {
    const layout = togglePin(DEFAULT_LAYOUT, 'proofs');
    const dragged = reorder(layout, ['criteria', 'proofs', 'checks', 'tests', 'threads', 'twins']);
    expect(dragged.order).toEqual(['proofs', 'criteria', 'checks', 'tests', 'threads', 'twins']);
  });

  it('monter et descendre restent dans le groupe du widget, et rien ne bouge au bord', () => {
    const layout = togglePin(DEFAULT_LAYOUT, 'twins');
    expect(placeOf(layout, 'criteria')).toEqual({
      position: 2,
      count: 6,
      canUp: false,
      canDown: true,
    });
    expect(move(layout, 'criteria', -1)).toBe(layout);
    expect(move(layout, 'checks', -1).order).toEqual([
      'twins',
      'checks',
      'criteria',
      'tests',
      'proofs',
      'threads',
    ]);
    expect(move(layout, 'twins', 1)).toBe(layout);
  });

  it('replier et déplier un widget', () => {
    const open = toggleCollapsed(DEFAULT_LAYOUT, 'criteria');
    expect(open.collapsed).toEqual(['twins']);
    expect(toggleCollapsed(open, 'twins').collapsed).toEqual([]);
  });

  it('une disposition relue écarte l’inconnu, ajoute les widgets nouveaux et remet les épinglés en tête', () => {
    expect(
      normalizeLayout({
        order: ['tests', 'ancien', 'criteria', 'tests'],
        pinned: ['criteria', 'ancien'],
        collapsed: ['proofs', 42],
      }),
    ).toEqual({
      order: ['criteria', 'tests', 'checks', 'proofs', 'threads', 'twins'],
      pinned: ['criteria'],
      collapsed: ['proofs'],
      half: [],
    });
    expect(normalizeLayout('cassé')).toBe(DEFAULT_LAYOUT);
    expect(normalizeLayout(null)).toBe(DEFAULT_LAYOUT);
  });

  it('la disposition enregistrée revient à la visite suivante', () => {
    expect(loadLayout()).toBe(DEFAULT_LAYOUT);
    const mine = togglePin(toggleCollapsed(DEFAULT_LAYOUT, 'criteria'), 'twins');
    saveLayout(mine);
    expect(loadLayout()).toEqual(mine);
    window.localStorage.setItem('factory-live:acceptance-layout', '{pas du json');
    expect(loadLayout()).toBe(DEFAULT_LAYOUT);
  });
});
