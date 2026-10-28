import { CodeIcon, RocketIcon, WorkflowIcon } from '@primer/octicons-react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fitsWide } from './FlowCanvas.tsx';
import { FlowRail } from './FlowRail.tsx';
import type { RailStep } from './FlowRail.tsx';

const steps = (patch: Partial<Record<string, Partial<RailStep>>> = {}): RailStep[] =>
  [
    { id: 'brief', icon: WorkflowIcon, tone: 'success' as const, title: 'Brief', meta: 'Terminée' },
    { id: 'impl', icon: CodeIcon, tone: 'accent' as const, title: 'Implémentation' },
    { id: 'release', icon: RocketIcon, tone: 'muted' as const, title: 'Release' },
  ].map((step) => ({ ...step, ...patch[step.id] }));

describe('FlowRail', () => {
  it('pose les étapes dans l’ordre, une liaison entre deux étapes, aucune après la dernière', () => {
    const { container } = render(<FlowRail steps={steps()} label="Ligne d’usine" />);
    const items = within(screen.getByRole('list', { name: 'Ligne d’usine' })).getAllByRole(
      'listitem',
    );
    expect(items.map((item) => item.textContent)).toEqual([
      'BriefTerminée',
      'Implémentation',
      'Release',
    ]);
    expect(container.querySelectorAll('[data-parallel], span[class*="railLink"]')).toHaveLength(2);
  });

  it('montre le flux vers l’étape au travail et passe en pointillés vers une étape menée en parallèle', () => {
    const { container } = render(
      <FlowRail
        steps={steps({ brief: { next: { flowing: true } }, release: { parallel: true } })}
      />,
    );
    const links = [...container.querySelectorAll('span[class*="railLink"]')];
    expect(links[0]?.hasAttribute('data-active')).toBe(true);
    expect(links[0]?.querySelector('[data-loop]')).not.toBeNull();
    expect(links[1]?.hasAttribute('data-parallel')).toBe(true);
    expect(links[1]?.hasAttribute('data-active')).toBe(false);
  });

  it('fait d’une étape à choisir un bouton à bascule, qui couvre toute la ligne', async () => {
    const onSelect = vi.fn();
    render(<FlowRail steps={steps({ impl: { onSelect, selected: true } })} />);
    const button = screen.getByRole('button', { name: 'Implémentation' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button.closest('li')).toHaveAttribute('data-selected');
    await userEvent.click(button);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Brief' })).toBeNull();
  });

  it('fait glisser les issues en transit sur la liaison', () => {
    render(
      <FlowRail
        steps={steps({ brief: { next: { packets: [{ id: 'cv-site#49-1', label: '#49' }] } } })}
      />,
    );
    expect(screen.getByText('#49')).toBeInTheDocument();
  });
});

describe('fitsWide', () => {
  it('garde le graphe en largeur tant qu’il reste lisible (zoom 0,8 avec sa marge), sinon la voie', () => {
    // Ligne d'usine, six stations : 1 168 px à 100 %. Bureau, portable, iPad en portrait.
    expect(fitsWide(1160, 1168)).toBe(true);
    expect(fitsWide(1016, 1168)).toBe(true);
    expect(fitsWide(788, 1168)).toBe(false);
    // Graphe d'une issue à trois cartes : 856 px. iPhone, iPad en portrait.
    expect(fitsWide(358, 856)).toBe(false);
    expect(fitsWide(772, 856)).toBe(true);
  });
});
