import { sheetStateOf } from './sheetState.ts';
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
    // A sheet the core refuses, as it says it, or a sheet of a wrong form: both show why.
    const parsed = sheetStateOf(null, 'duplicate station "write"');
    if (parsed.ok) throw new Error('the sheet should be refused');
    const malformed = sheetStateOf({ item: { type: 'video', label: 'Vidéo' } }, null);
    expect(malformed.ok).toBe(false);
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
