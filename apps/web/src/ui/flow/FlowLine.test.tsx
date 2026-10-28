import { CodeIcon, RocketIcon, WorkflowIcon } from '@primer/octicons-react';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlowLine, lineMinWidth } from './FlowLine.tsx';
import type { LineStep } from './FlowLine.tsx';

const STEPS: LineStep[] = [
  { id: 'brief', icon: WorkflowIcon, tone: 'success', title: 'Brief', flowing: true },
  { id: 'impl', icon: CodeIcon, tone: 'accent', title: 'Implémentation', children: <p>job</p> },
  { id: 'done', icon: RocketIcon, tone: 'muted', title: 'Terminé', compact: true },
];

/** jsdom ne mesure rien : la largeur du conteneur est imposée. */
function renderAt(width: number, steps = STEPS) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, width, 100),
  );
  return render(<FlowLine steps={steps} label="Ligne d’usine" />);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FlowLine', () => {
  it('pose les colonnes côte à côte quand elles tiennent, sinon passe à la verticale', () => {
    // Deux colonnes de 10 rem, une de bord de 7 rem, deux écarts de 1,5 rem : 30 rem.
    expect(lineMinWidth(STEPS, 10)).toBe(30 * 16);
    expect(renderAt(480).getByRole('group', { name: 'Ligne d’usine' }).dataset['orientation']).toBe(
      'horizontal',
    );
  });

  it('passe à la verticale sur un téléphone', () => {
    expect(renderAt(358).getByRole('group', { name: 'Ligne d’usine' }).dataset['orientation']).toBe(
      'vertical',
    );
  });

  it('donne les étapes dans l’ordre, une voie entre deux arrêts, un flux vers l’étape au travail', () => {
    const { container } = renderAt(1200);
    const items = within(screen.getByRole('group', { name: 'Ligne d’usine' })).getAllByRole(
      'listitem',
    );
    expect(items.map((item) => item.textContent)).toEqual([
      'Brief',
      'Implémentationjob',
      'Terminé',
    ]);
    const links = [...container.querySelectorAll('span[class*="link"]')];
    expect(links).toHaveLength(2);
    expect(links[0]?.hasAttribute('data-active')).toBe(true);
    expect(links[0]?.querySelector('[data-loop]')).not.toBeNull();
    expect(links[1]?.hasAttribute('data-active')).toBe(false);
    expect(items[2]).toHaveAttribute('data-compact');
  });
});
