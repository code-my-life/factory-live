import { parseWorkflowSheet } from '@factory-live/contracts';
import type { WorkflowSheet } from '@factory-live/contracts';
import { render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../i18n/I18nProvider.tsx';
import { WorkflowGraph } from './WorkflowGraph.tsx';

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

/** A workflow of three stations, none of which the code line knows: a video studio. */
const STUDIO = {
  item: { type: 'video', label: 'Vidéo' },
  stations: [
    { key: 'script', label: 'Scénario', icon: 'pencil', kind: 'ai', col: 0, row: 1 },
    { key: 'render', label: 'Rendu', icon: 'video', kind: 'script', col: 1, row: 1 },
    { key: 'approve', label: 'Validation', icon: 'eye', kind: 'owner', col: 2, row: 1 },
  ],
  edges: [
    { from: 'script', to: 'render', kind: 'line' },
    { from: 'render', to: 'approve', kind: 'line' },
    { from: 'approve', to: 'script', kind: 'return', label: 'Retour : à reprendre' },
  ],
  models: [],
};

function draw(sheet: WorkflowSheet) {
  return render(
    <I18nProvider>
      <WorkflowGraph
        sheet={sheet}
        items={[]}
        providers={[]}
        selectedKey={null}
        onSelect={() => undefined}
        now={Date.parse('2026-11-05T12:00:00Z')}
        maxInProgress={2}
      />
    </I18nProvider>,
  );
}

describe('WorkflowGraph', () => {
  it('une fiche de trois postes se dessine avec la nature de chacun et les fournisseurs', () => {
    const parsed = parseWorkflowSheet(STUDIO);
    if (!parsed.ok) throw new Error(parsed.error);
    const { container } = draw(parsed.sheet);
    const box = (key: string) => container.querySelector(`[data-box="${key}"]`) as HTMLElement;

    // Each station, named by its sheet, says who does its work.
    for (const [key, label, kind, word] of [
      ['script', 'Scénario', 'ai', 'IA'],
      ['render', 'Rendu', 'script', 'Script'],
      ['approve', 'Validation', 'owner', 'Toi'],
    ] as const) {
      expect(box(key), key).toHaveTextContent(label);
      const chip = box(key).querySelector('[data-kind]');
      expect(chip, key).toHaveAttribute('data-kind', kind);
      expect(chip, key).toHaveTextContent(word);
    }

    // A station is `ai`: the providers' block is drawn under it, empty until an agent calls a model.
    const providers = box('models');
    expect(providers).toHaveTextContent('Fournisseurs');
    expect(within(providers).getByText('Aucune issue')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-box]')).toHaveLength(4);

    // Without an `ai` station, no providers.
    const scripted = parseWorkflowSheet({
      ...STUDIO,
      stations: STUDIO.stations.map((station) => ({ ...station, kind: 'script' })),
    });
    if (!scripted.ok) throw new Error(scripted.error);
    const plain = draw(scripted.sheet);
    expect(plain.container.querySelector('[data-box="models"]')).toBeNull();
    expect(plain.container.querySelectorAll('[data-kind="script"]')).toHaveLength(3);
  });
});
