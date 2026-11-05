import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider.tsx';
import { ComponentsPage } from './ComponentsPage.tsx';

class NoResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// jsdom has neither `ResizeObserver` (Primer's overflow hook) nor the `popover` attribute (the
// tooltips of Primer's icon buttons): stubbed here, as for the graph's tests.
beforeEach(() => {
  localStorage.setItem('factory-live:locale', 'fr');
  vi.stubGlobal('ResizeObserver', NoResizeObserver);
  Object.defineProperty(HTMLElement.prototype, 'popover', {
    value: null,
    writable: true,
    configurable: true,
  });
});
afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

function show() {
  return render(
    <I18nProvider>
      <ComponentsPage />
    </I18nProvider>,
  );
}

const section = (title: string) =>
  screen.getByRole('heading', { level: 2, name: title }).closest('section') as HTMLElement;

describe('ComponentsPage', () => {
  it('chaque bloc a sa section, et chaque section montre ses états', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'Composants' })).toBeInTheDocument();

    // The station: empty, with rows, with « and N more », with the open row.
    const station = section('Poste');
    expect(station.querySelectorAll('[data-box="write"]')).toHaveLength(4);
    expect(within(station).getAllByText('Aucune issue')).toHaveLength(1);
    expect(within(station).getByText('et 2 autres')).toBeInTheDocument();
    expect(station.querySelectorAll('[data-selected]')).toHaveLength(1);

    // The kinds of work: a chip each, none for the end.
    const kind = section('Nature du poste');
    expect(
      [...kind.querySelectorAll('[data-kind]')].map((chip) => chip.getAttribute('data-kind')),
    ).toEqual(['ai', 'script', 'github', 'owner']);
    expect(within(kind).getByText('Fin : aucune puce')).toBeInTheDocument();

    // An item's row in each of its six states, with an agent calling its model, waiting for a slot.
    const row = section('Ligne d’élément');
    expect(row.querySelectorAll('[data-issue]')).toHaveLength(8);
    for (const tone of ['accent', 'attention', 'danger', 'secondary', 'done'])
      expect(row.querySelector(`[data-issue][data-tone="${tone}"]`), tone).not.toBeNull();
    expect(within(row).getByText('coder-claude · claude-opus-5-5')).toBeInTheDocument();
    expect(within(row).getAllByText(/Attend une place/).length).toBeGreaterThan(0);

    // The providers: empty, at rest, answering.
    const providers = section('Fournisseurs');
    expect(providers.querySelectorAll('[data-box="models"]')).toHaveLength(3);
    expect(providers.querySelectorAll('[data-busy]')).toHaveLength(1);

    // A group's frame around its member, coloured as its series.
    const group = section('Cadre d’un groupe');
    expect(within(group).getAllByText('Contrôles').length).toBeGreaterThan(0);
    expect(within(group).getByText('Relecture')).toBeInTheDocument();

    // Every kind of link at rest and in use; the return taken after a failure, then on a request.
    const links = section('Liens');
    for (const variant of ['line', 'branch', 'fan']) {
      expect(links.querySelectorAll(`svg[data-link="${variant}"]:not([data-active])`)).toHaveLength(
        1,
      );
      expect(links.querySelectorAll(`svg[data-link="${variant}"][data-active]`)).toHaveLength(1);
    }
    expect(within(links).getByRole('img', { name: 'Ligne : En activité' })).toHaveAttribute(
      'data-active',
    );
    expect(
      [...links.querySelectorAll('svg[data-link="return"]')].map((svg) => [
        svg.getAttribute('aria-label'),
        svg.hasAttribute('data-active'),
        svg.getAttribute('data-cause'),
      ]),
    ).toEqual([
      ['Retour : Au repos', false, null],
      ['Retour : Pris après un échec', true, 'problem'],
      ['Retour : Pris sur une demande', true, 'request'],
    ]);

    // The zoom's controls.
    expect(
      within(section('Zoom')).getByRole('group', { name: 'Zoom du graphe' }),
    ).toBeInTheDocument();
  });

  it('la légende s’ouvre et se replie à son bouton, fermée ou ouverte au départ', () => {
    show();
    const legend = section('Légende');
    const [closed, open] = within(legend).getAllByRole('button', { name: 'Légende' }) as [
      HTMLElement,
      HTMLElement,
    ];
    expect(closed).toHaveAttribute('aria-expanded', 'false');
    expect(open).toHaveAttribute('aria-expanded', 'true');
    expect(within(legend).getAllByRole('list', { name: 'Légende des liens' })).toHaveLength(1);

    fireEvent.click(closed);
    expect(closed).toHaveAttribute('aria-expanded', 'true');
    expect(within(legend).getAllByRole('list', { name: 'Légende des liens' })).toHaveLength(2);
    fireEvent.click(open);
    expect(open).toHaveAttribute('aria-expanded', 'false');
    expect(within(legend).getAllByRole('list', { name: 'Légende des liens' })).toHaveLength(1);
  });

  it('la fiche de trois postes se dessine avec les blocs ; la fiche refusée dit pourquoi', () => {
    show();
    const graph = screen.getByRole('region', { name: 'La ligne d’usine' });
    for (const [key, label] of [
      ['write', 'Scénario'],
      ['render', 'Rendu'],
      ['approve', 'Validation'],
    ] as const)
      expect(graph.querySelector(`[data-box="${key}"]`), key).toHaveTextContent(label);
    // The script's agent calls its model: the providers answer, up the feed to Scénario.
    expect(graph.querySelectorAll('[data-busy]')).toHaveLength(1);
    expect(graph.querySelector('[data-active-edge="models:write"]')).not.toBeNull();
    expect(graph.querySelectorAll('[data-box="write"] [data-issue]')).toHaveLength(3);

    expect(
      screen.getByRole('heading', { name: 'Une fiche refusée : la page reste debout' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('La fiche de ce workflow est refusée : le graphe ne peut pas se dessiner'),
    ).toBeInTheDocument();
    expect(screen.getByText(/duplicate station "write"/)).toBeInTheDocument();
  });
});
