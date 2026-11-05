import { parseWorkflowSheet } from '@factory-live/contracts';
import type { IssueSummary, WorkflowSheet } from '@factory-live/contracts';
import { render, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../i18n/I18nProvider.tsx';
import { MotionProvider } from '../../../ui/motion.tsx';
import type { LineIssue } from './model.ts';
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

  /** A video of the studio, at `station` after the `stations` of its journey. */
  const video = (station: string, stations: string[]): LineIssue[] => {
    const issue: IssueSummary = {
      key: 'video-factory#12',
      repo: 'video-factory',
      number: 12,
      title: 'Présenter la ligne d’usine en une minute',
      url: 'https://github.com/code-my-life/video-factory/issues/12',
      labels: [],
      station: 'implementation',
      previousStation: null,
      stationChangedAt: null,
      status: 'active',
      claudeModel: null,
      harness: null,
      pr: null,
      prUrl: null,
      activeProfiles: [],
      interventionIds: [],
      startedAt: '2026-11-05T09:00:00Z',
      updatedAt: '2026-11-05T11:00:00Z',
      type: null,
      lane: null,
      journey: stations.map((at) => ({
        station: at as IssueSummary['station'],
        lane: null,
        outcome: null,
        at: '2026-11-05T10:00:00Z',
      })),
    };
    return [{ issue, box: station, agent: null, intervention: null }];
  };
  const studio = () => {
    const parsed = parseWorkflowSheet(STUDIO);
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.sheet;
  };
  const view = (sheet: WorkflowSheet, items: LineIssue[]) => (
    <I18nProvider>
      <MotionProvider>
        <WorkflowGraph
          sheet={sheet}
          items={items}
          providers={[]}
          selectedKey={null}
          onSelect={() => undefined}
          now={Date.parse('2026-11-05T12:00:00Z')}
          maxInProgress={2}
        />
      </MotionProvider>
    </I18nProvider>
  );
  const row = (container: HTMLElement, box: string) =>
    container.querySelector(`[data-box="${box}"] [data-issue="video-factory#12"]`);

  it('une carte encore en route qui repart ne laisse qu’un trajet, le nouveau', () => {
    const sheet = studio();
    const { container, rerender } = render(view(sheet, video('script', ['script'])));
    rerender(view(sheet, video('render', ['script', 'render'])));
    const first = container.querySelectorAll('[data-traveller="video-factory#12"]');
    expect(first).toHaveLength(1);
    expect(container.querySelector('[data-active-edge="line:script"]')).not.toBeNull();

    // Before the card sets down in Rendu, the video moves on to Validation: the first trip gives way.
    rerender(view(sheet, video('approve', ['script', 'render', 'approve'])));
    const travellers = container.querySelectorAll('[data-traveller="video-factory#12"]');
    expect(travellers).toHaveLength(1);
    expect(travellers[0]).not.toBe(first[0]);
    expect(container.querySelector('[data-active-edge="line:render"]')).not.toBeNull();
    expect(row(container, 'approve')).toHaveAttribute('data-arriving');
  });

  it('la carte arrivée se pose : sa ligne paraît, cerclée un instant, puis redevient ordinaire', async () => {
    MotionGlobalConfig.skipAnimations = true;
    try {
      const sheet = studio();
      const { container, rerender } = render(view(sheet, video('script', ['script'])));
      rerender(view(sheet, video('render', ['script', 'render'])));

      // The trip completes at once: the card is gone, the row shows and takes the knock.
      await waitFor(() =>
        expect(container.querySelector('[data-traveller="video-factory#12"]')).toBeNull(),
      );
      expect(row(container, 'render')).not.toHaveAttribute('data-arriving');
      expect(row(container, 'render')).toHaveAttribute('data-landed');
      // A moment later, the ring is gone.
      await waitFor(() => expect(row(container, 'render')).not.toHaveAttribute('data-landed'));
    } finally {
      MotionGlobalConfig.skipAnimations = false;
    }
  });
});
