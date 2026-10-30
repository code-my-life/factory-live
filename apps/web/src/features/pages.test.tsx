import type { Intervention, ProfileView } from '@factory-live/contracts';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../app/AppShell.tsx';
import { ColorModeProvider } from '../app/colorMode.tsx';
import { FactoryProvider } from '../data/FactoryProvider.tsx';
import { buildProfiles } from '../demo/catalog.ts';
import { DemoSource } from '../demo/DemoSource.ts';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import { hueOf } from '../ui/badge/hues.ts';
import { AgentsPage } from './agents/AgentsPage.tsx';
import { CostsPage } from './costs/CostsPage.tsx';
import { HistoryPage } from './history/HistoryPage.tsx';
import { InterventionDetail } from './interventions/InterventionDetail.tsx';
import { IssuePage } from './issues/IssuePage.tsx';
import { FactoryLinePage } from './line/FactoryLinePage.tsx';

const QWEN = 'Qwen3.5-9B-The-Defiant-Fable-Uncnr-Heretic-plusIQ-TOOLS-NEO-MAX-MTP-Q8_0';
const NEMOTRON = 'nvidia/nemotron-3-ultra-550b-a55b';

/** The demo scenario, with the profiles replaced when a test needs particular configuration drifts. */
class TestSource extends DemoSource {
  private readonly profiles: readonly ProfileView[] | undefined;

  constructor(profiles?: readonly ProfileView[]) {
    super();
    this.profiles = profiles;
  }

  override getProfiles(): readonly ProfileView[] {
    return this.profiles ?? super.getProfiles();
  }
}

function renderPage(page: ReactNode, route = '/', path = '/', source = new TestSource()) {
  return render(
    <I18nProvider>
      <ColorModeProvider>
        <FactoryProvider source={source}>
          <MemoryRouter initialEntries={[route]}>
            <Routes>
              <Route path={path} element={page} />
            </Routes>
          </MemoryRouter>
        </FactoryProvider>
      </ColorModeProvider>
    </I18nProvider>,
  );
}

const badges = (container: HTMLElement, word: string) =>
  [...container.querySelectorAll('[data-badge]')].filter(
    (badge) => badge.querySelector('[data-segment="label"]')?.textContent === word,
  );

// jsdom has neither `ResizeObserver` (Primer's overflow hook) nor the `popover` attribute (Primer's
// tooltips): stubbed here, for these full-page renders only.
class NoResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  localStorage.setItem('factory-live:locale', 'fr');
  vi.useFakeTimers();
  vi.stubGlobal('ResizeObserver', NoResizeObserver);
  Object.defineProperty(HTMLElement.prototype, 'popover', {
    value: null,
    writable: true,
    configurable: true,
  });
});
afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('l’écran Agents, en badges', () => {
  it('montre skills, plugins, toolsets, serveurs MCP, effort et modèles en badges', () => {
    const { container } = renderPage(<AgentsPage />);
    const card = container.querySelector('article') as HTMLElement;
    expect(badges(card, 'skill').length).toBeGreaterThan(0);
    expect(badges(card, 'plugin').length).toBeGreaterThan(0);
    expect(badges(card, 'toolset').length).toBeGreaterThan(0);
    expect(badges(card, 'MCP')).toHaveLength(1);
    expect(badges(card, 'effort')).toHaveLength(1);
    expect(badges(card, 'poste')).toHaveLength(1);
    // A `mcp-<server>` toolset is not repeated: its server has its own badge.
    expect(card).not.toHaveTextContent('mcp-graphify');
    // A plugin's refusals stay as text, after the badge.
    expect(card).toHaveTextContent(/refus/);
    expect(container.querySelector('[data-overflow="wrap"]')).toBeNull();
  });

  it('garde affiché un toolset `mcp-<serveur>` dont le serveur n’est pas déclaré', () => {
    const [first, ...others] = buildProfiles();
    const inconsistent = {
      ...first,
      toolsets: ['terminal', 'mcp-graphify', 'mcp-ghost'],
      mcp: ['graphify'],
    } as ProfileView;
    const { container } = renderPage(
      <AgentsPage />,
      '/',
      '/',
      new TestSource([inconsistent, ...others]),
    );
    const card = container.querySelector('article') as HTMLElement;
    expect(card).not.toHaveTextContent('mcp-graphify');
    expect(card).toHaveTextContent('mcp-ghost');
  });

  it('écrit un écart de toolsets ou de plugins en badges, comme un écart de modèles', () => {
    const [first, ...others] = buildProfiles();
    const drifting = {
      ...first,
      drift: [
        { field: 'model', live: 'auto (freellmapi)', repo: `${NEMOTRON} (nvidia)` },
        { field: 'fallbacks', live: null, repo: `${QWEN} (llamacpp)` },
        { field: 'toolsets', live: 'terminal, file', repo: 'terminal' },
        { field: 'plugins', live: 'coder-guard', repo: null },
        { field: 'effort', live: 'high', repo: null },
      ],
    } as ProfileView;
    const { container } = renderPage(
      <AgentsPage />,
      '/',
      '/',
      new TestSource([drifting, ...others]),
    );
    const drift = container.querySelector('section[aria-label]:has(ul) ul') as HTMLElement;
    expect(badges(drift, 'toolset')).toHaveLength(3);
    expect(badges(drift, 'plugin')).toHaveLength(1);
    expect(badges(drift, 'modèle')).toHaveLength(0);
    expect(drift).toHaveTextContent('effort');
    // A long model stays on one line: cut in the middle, full name for screen readers.
    expect(drift.querySelectorAll('[data-split]').length).toBeGreaterThan(0);
  });
});

describe('l’écran Coûts et l’Historique, un badge par ligne', () => {
  it('coupe les noms de modèle trop longs au milieu dans le tableau des coûts', () => {
    const { container } = renderPage(<CostsPage />);
    const full = [...container.querySelectorAll('[data-split] > .fl-visually-hidden')].map(
      (node) => node.textContent,
    );
    expect(full).toEqual(expect.arrayContaining([QWEN, NEMOTRON]));
    expect(container.querySelector('[data-overflow="clamp"]')).toBeNull();
  });

  it('rend chaque modèle deux fois : une fiche pour le téléphone, une ligne du tableau', () => {
    const { container } = renderPage(<CostsPage />);
    const cards = container.querySelectorAll('ul li [data-badge]');
    const rows = container.querySelectorAll('[role="row"] [data-badge]');
    expect(cards.length).toBeGreaterThan(0);
    expect(rows.length).toBe(cards.length);
  });

  it('porte le dépôt de l’issue et sa teinte sur la version de chaque ligne de l’Historique', () => {
    const { container } = renderPage(<HistoryPage />);
    const version = [...container.querySelectorAll('[data-badge]')].find(
      (badge) => badge.querySelector('[data-segment="value"]')?.textContent === 'v0.12.0',
    );
    expect(version).toBeDefined();
    expect(version?.querySelector('[data-segment="label"]')).toHaveTextContent('claude-cockpit');
    expect(version).toHaveAttribute('data-hue', hueOf('product', 'claude-cockpit'));
  });

  it('montre l’agent de chaque harnais et le modèle utilisé en badges dans l’Historique', () => {
    const { container } = renderPage(<HistoryPage />);
    expect(badges(container, 'agent').length).toBeGreaterThan(0);
    expect(badges(container, 'lane').length + badges(container, 'modèle').length).toBeGreaterThan(
      0,
    );
  });
});

describe('la Ligne et la barre latérale, en badges', () => {
  it('montre l’agent d’une carte à part et le tableau dans sa teinte', () => {
    const { container } = renderPage(<FactoryLinePage />);
    expect(container).toBeInTheDocument();
    const shell = renderPage(<AppShell />, '/', '/');
    const board = badges(shell.container, 'board')[0] ?? badges(shell.container, 'tableau')[0];
    expect(board).toHaveAttribute('data-hue', 'brown');
  });
});

describe('l’écran d’une issue, en badges', () => {
  const route = (key: string) => `/issues/${key.replace('#', '/')}`;
  const source = new TestSource();
  const issues = source.getSnapshot().issues;

  it('montre le poste, l’agent, la PR, la CI et les étiquettes GitHub dans leurs teintes', () => {
    const withPr = issues.find((issue) => issue.pr) ?? issues[0];
    expect(withPr).toBeDefined();
    const key = (withPr as (typeof issues)[number]).key;
    const { container } = renderPage(
      <IssuePage />,
      route(key),
      '/issues/:repo/:number',
      new TestSource(),
    );
    expect(badges(container, 'poste').length).toBeGreaterThan(0);
    expect(badges(container, 'étiquette').length).toBeGreaterThan(0);
    for (const label of badges(container, 'étiquette')) expect(label).toHaveAttribute('data-tint');
    expect(container.querySelector('[data-hue]')).not.toBeNull();
  });

  it('rend chaque issue de la démo, avec ou sans PR connue', () => {
    for (const issue of issues) {
      const { container, unmount } = renderPage(
        <IssuePage />,
        route(issue.key),
        '/issues/:repo/:number',
        new TestSource(),
      );
      expect(badges(container, 'poste').length).toBeGreaterThan(0);
      expect(container.querySelector('[data-overflow="wrap"]')).toBeNull();
      unmount();
    }
  });
});

describe('le détail d’une intervention, en badges', () => {
  it('écrit la branche, la PR et les sources du diagnostic en badges', () => {
    const intervention = new TestSource()
      .getSnapshot()
      .interventions.find((candidate) => candidate.diagnosis) as Intervention;
    expect(intervention.diagnosis).toBeDefined();
    const diagnosis = intervention.diagnosis as NonNullable<Intervention['diagnosis']>;
    const patched = {
      ...intervention,
      diagnosis: {
        ...diagnosis,
        work: {
          ...(diagnosis.work as NonNullable<typeof diagnosis.work>),
          branch: 'fix/90-v2',
          prUrl: 'https://github.com/code-my-life/claude-cockpit/pull/92',
        },
      },
    } as Intervention;
    const { container } = renderPage(<InterventionDetail intervention={patched} />);
    const [branch] = badges(container, 'branche');
    expect(branch).toBeDefined();
    expect(within(branch as HTMLElement).getByText('fix/90-v2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '#92' })).toHaveAttribute(
      'href',
      'https://github.com/code-my-life/claude-cockpit/pull/92',
    );
    expect(badges(container, 'source').length).toBeGreaterThan(0);
  });

  it('écrit « inconnue » quand la branche n’est pas connue, la PR sans dépôt sans issue', () => {
    const intervention = new TestSource()
      .getSnapshot()
      .interventions.find((candidate) => candidate.diagnosis) as Intervention;
    const diagnosis = intervention.diagnosis as NonNullable<Intervention['diagnosis']>;
    const patched = {
      ...intervention,
      issueKey: null,
      diagnosis: {
        ...diagnosis,
        work: {
          ...(diagnosis.work as NonNullable<typeof diagnosis.work>),
          branch: null,
          prUrl: 'https://github.com/code-my-life/claude-cockpit/pull/92',
        },
      },
    } as unknown as Intervention;
    const { container } = renderPage(<InterventionDetail intervention={patched} />);
    expect(container).toHaveTextContent('inconnue');
    expect(screen.getByRole('link', { name: '#92' })).toBeInTheDocument();
  });
});
