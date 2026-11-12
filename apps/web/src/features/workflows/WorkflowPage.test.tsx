import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../app/AppShell.tsx';
import { ColorModeProvider } from '../../app/colorMode.tsx';
import { FactoryProvider } from '../../data/FactoryProvider.tsx';
import { DemoSource } from '../../demo/DemoSource.ts';
import { I18nProvider } from '../../i18n/I18nProvider.tsx';
import { createDemoWorkflowsSource } from './source.ts';
import type { WorkflowsSource } from './source.ts';
import { WorkflowsProvider } from './WorkflowsProvider.tsx';

// jsdom has neither `ResizeObserver` (Primer's overflow hook) nor the `popover` attribute (Primer's
// tooltips): stubbed here, for these full-page renders only.
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

function renderShell(source: WorkflowsSource) {
  return render(
    <I18nProvider>
      <ColorModeProvider>
        <FactoryProvider source={new DemoSource()}>
          <WorkflowsProvider source={source}>
            <MemoryRouter initialEntries={['/']}>
              <Routes>
                <Route path="/" element={<AppShell />} />
              </Routes>
            </MemoryRouter>
          </WorkflowsProvider>
        </FactoryProvider>
      </ColorModeProvider>
    </I18nProvider>,
  );
}

/** A source that declares no generic workflow, as a server on Hermes' side. */
const NONE: WorkflowsSource = {
  kind: 'live',
  workflows: () => Promise.resolve([]),
  data: () => Promise.resolve([]),
};

describe('WorkflowPage', () => {
  it('l’entrée de navigation suit les workflows déclarés', async () => {
    const declared = renderShell(createDemoWorkflowsSource());
    const navigation = screen.getByRole('navigation', { name: 'Navigation principale' });
    // The demo's made-up workflow: an entry by its key, with the count of its items waiting for you.
    const entry = await within(navigation).findByRole('link', { name: /essai/ });
    expect(entry).toHaveAttribute('href', '/workflows/essai');
    expect(entry).toHaveTextContent('1');
    declared.unmount();

    renderShell(NONE);
    const bare = screen.getByRole('navigation', { name: 'Navigation principale' });
    await waitFor(() => expect(within(bare).getByRole('link', { name: /Agents/ })).toBeVisible());
    expect(within(bare).queryByRole('link', { name: /essai/ })).toBeNull();
  });
});
