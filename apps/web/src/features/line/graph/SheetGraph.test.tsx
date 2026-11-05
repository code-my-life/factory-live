import { parseWorkflowSheet } from '@factory-live/contracts';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../i18n/I18nProvider.tsx';
import { SheetGraph } from './FactoryGraph.tsx';

class NoResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

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

describe('SheetGraph', () => {
  it('une fiche refusée montre pourquoi, à la place du graphe', () => {
    const parsed = parseWorkflowSheet({ item: { type: 'video', label: 'Vidéo' } });
    if (parsed.ok) throw new Error('the sheet should be refused');
    const { container } = render(
      <I18nProvider>
        <SheetGraph
          parsed={parsed}
          items={[]}
          providers={[]}
          selectedKey={null}
          onSelect={() => undefined}
          now={Date.parse('2026-11-05T12:00:00Z')}
          maxInProgress={2}
        />
      </I18nProvider>,
    );
    expect(
      screen.getByText('La fiche de ce workflow est refusée : le graphe ne peut pas se dessiner'),
    ).toBeInTheDocument();
    expect(screen.getByText(parsed.error)).toBeInTheDocument();
    expect(container.querySelector('[data-box]')).toBeNull();
    expect(screen.queryByRole('region', { name: 'La ligne d’usine' })).toBeNull();
  });
});
