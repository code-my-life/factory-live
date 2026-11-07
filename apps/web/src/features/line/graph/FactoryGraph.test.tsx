import type { AgentActivity, IssueSummary } from '@factory-live/contracts';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../i18n/I18nProvider.tsx';
import { MotionProvider } from '../../../ui/motion.tsx';
import { FactoryGraph } from './FactoryGraph.tsx';
import { boxOf, providerRows } from './model.ts';
import type { LineIssue } from './model.ts';

class NoResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// jsdom has neither `ResizeObserver` (Primer's overflow hook) nor the `popover` attribute (the
// tooltips of Primer's icon buttons): stubbed here, as for the full-page renders.
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

const NOW = Date.parse('2026-11-03T18:00:00Z');

function issue(key: string, title: string, station: IssueSummary['station']): IssueSummary {
  const [repo = '', number = '0'] = key.split('#');
  return {
    key,
    repo,
    number: Number(number),
    title,
    url: `https://github.com/code-my-life/${repo}/issues/${number}`,
    labels: [],
    station,
    previousStation: null,
    stationChangedAt: null,
    status: station === 'done' ? 'done' : 'active',
    claudeModel: null,
    harness: null,
    pr: null,
    prUrl: null,
    activeProfiles: [],
    interventionIds: [],
    startedAt: '2026-11-03T17:00:00Z',
    updatedAt: '2026-11-03T17:30:00Z',
    type: null,
    lane: 'failfirst',
    journey: [],
  };
}

/** The nine issues of the validated mockup, one or two per station. */
const ISSUES = [
  issue('claude-cockpit#71', 'Vue ÉQUIPE : regrouper les cartes par projet', 'implementation'),
  issue('cv-site#47', 'Formulaire de contact : validation côté serveur', 'gate'),
  issue('claude-cockpit#73', 'Raccourci clavier pour répondre à la dernière question', 'brief'),
  issue('claude-cockpit#68', 'Tag automatique des versions sur main', 'review'),
  issue('cv-site#44', 'Pied de page : liens vers GitHub et LinkedIn', 'implementation'),
  issue('claude-cockpit#76', 'E2E PR 3 : raccourcis clavier de l’île', 'gate'),
  issue('claude-cockpit#42', 'E2E PR 2 : actions des cartes et lanceur', 'done'),
  issue('claude-cockpit#52', 'Île : le bouton Détails chevauche l’encart', 'diagnostic'),
  issue('cv-site#46', 'CODEOWNERS sur main', 'ci'),
];

const ITEMS: LineIssue[] = ISSUES.map((summary) => ({
  issue: summary,
  box: boxOf(summary),
  agent: null,
  intervention: null,
}));

function renderGraph(items: LineIssue[] = ITEMS, selectedKey: string | null = null) {
  return render(
    <I18nProvider>
      <FactoryGraph
        items={items}
        providers={[]}
        selectedKey={selectedKey}
        onSelect={() => undefined}
        now={NOW}
        maxInProgress={2}
      />
    </I18nProvider>,
  );
}

const row = (container: HTMLElement, key: string) =>
  container.querySelector(`[data-issue="${key}"]`) as HTMLElement;

describe('FactoryGraph', () => {
  it('la recherche #71 garde une issue sur neuf et pâlit les autres', () => {
    const { container } = renderGraph();
    fireEvent.change(screen.getByRole('textbox', { name: 'Rechercher une issue' }), {
      target: { value: '#71' },
    });
    expect(screen.getByText('1 issue sur 9')).toBeInTheDocument();
    expect(row(container, 'claude-cockpit#71')).not.toHaveAttribute('data-dimmed');
    for (const { key } of ISSUES.filter((item) => item.key !== 'claude-cockpit#71'))
      expect(row(container, key) ?? null, key).toSatisfy(
        (element: HTMLElement | null) => element === null || element.hasAttribute('data-dimmed'),
      );
  });

  it('une issue Skill à la gate est dans la boîte Skill, nommée Skill sous son titre', () => {
    const skill: IssueSummary = {
      ...issue('skills#3', 'factory-issue : nommer les tests existants', 'gate'),
      type: 'skill',
      lane: 'skill',
    };
    const { container } = renderGraph([
      ...ITEMS,
      { issue: skill, box: boxOf(skill), agent: null, intervention: null },
    ]);
    const box = container.querySelector('[data-box="gate:skill"]') as HTMLElement;
    expect(box.querySelector('[data-issue="skills#3"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-issue="skills#3"]')).toHaveLength(1);
    // Its name, and the type it judges under it: never the raw key.
    expect(within(box).getAllByText('Skill').length).toBeGreaterThanOrEqual(2);
    expect(within(box).queryByText('skill')).toBeNull();
  });

  it('la légende est repliée à l’ouverture et s’ouvre au bouton', () => {
    renderGraph();
    const toggle = screen.getByRole('button', { name: 'Légende' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Légende des liens' })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const links = screen.getByRole('list', { name: 'Légende des liens' });
    expect(within(links).getAllByRole('listitem')).toHaveLength(11);
    // The Skill proof has its link in the legend, named in the PWA's language.
    expect(within(links).getByText('Preuve skill')).toBeInTheDocument();
  });

  it('Terminé montre l’issue terminée ouverte ou cherchée, même au-delà des deux dernières', async () => {
    // Four finished issues, #1 the last to finish: Terminé lists two of them and counts the others.
    // A later change to an issue (a label, a comment) does not move it up: the order is the finish's.
    const finished = [1, 2, 3, 4].map((number) => {
      const summary = issue(`cv-site#${number}`, `Issue finie ${number}`, 'done');
      return {
        issue: {
          ...summary,
          stationChangedAt: `2026-10-${30 - number}T12:00:00Z`,
          updatedAt: `2026-11-03T1${number}:00:00Z`,
        },
        box: boxOf(summary),
        agent: null,
        intervention: null,
      };
    });
    const done = (container: HTMLElement) =>
      [...container.querySelectorAll('[data-box="done"] [data-issue]')].map((element) =>
        element.getAttribute('data-issue'),
      );

    const opened = renderGraph(finished, 'cv-site#4');
    expect(done(opened.container)).toEqual(['cv-site#4', 'cv-site#1']);
    opened.unmount();

    const { container } = renderGraph(finished);
    expect(done(container)).toEqual(['cv-site#1', 'cv-site#2']);
    // A finished issue says since when, in days past a day.
    expect(row(container, 'cv-site#1')).toHaveTextContent('il y a 5 j');
    fireEvent.change(screen.getByRole('textbox', { name: 'Rechercher une issue' }), {
      target: { value: '#3' },
    });
    // The row that gives way fades out before it leaves the box.
    await waitFor(() => expect(done(container)).toEqual(['cv-site#3', 'cv-site#1']));
    expect(row(container, 'cv-site#3')).not.toHaveAttribute('data-dimmed');
    expect(screen.getByText('et 2 autres')).toBeInTheDocument();
  });

  it('une issue qui change de poste voyage le long des liens et paraît à l’arrivée ; en pause ou sans lien à suivre, sans trajet', () => {
    const at = (station: IssueSummary['station']) => ({
      station,
      lane: null,
      outcome: null,
      at: '2026-11-03T17:00:00Z',
    });
    const moving = (station: IssueSummary['station'], stations: IssueSummary['station'][]) => {
      const summary = {
        ...issue('cv-site#46', 'CODEOWNERS sur main', station),
        journey: stations.map(at),
      };
      return [{ issue: summary, box: boxOf(summary), agent: null, intervention: null }];
    };
    const view = (items: LineIssue[]) => (
      <I18nProvider>
        <MotionProvider>
          <FactoryGraph
            items={items}
            providers={[]}
            selectedKey={null}
            onSelect={() => undefined}
            now={NOW}
            maxInProgress={2}
          />
        </MotionProvider>
      </I18nProvider>
    );

    // Merged: the issue leaves Fusion for CI de main, as a card along the line's connector.
    const live = render(view(moving('merge', ['review', 'merge'])));
    live.rerender(view(moving('ci', ['review', 'merge', 'ci'])));
    const card = live.container.querySelector('[data-traveller="cv-site#46"]') as HTMLElement;
    expect(card.style.offsetPath).toMatch(/^path\("M /);
    const arriving = (container: HTMLElement) =>
      container.querySelector('[data-box="ci"] [data-issue="cv-site#46"]') as HTMLElement;
    expect(arriving(live.container)).toHaveAttribute('data-arriving');
    live.unmount();

    // Paused: the issue changes box at once, without a trip.
    localStorage.setItem('factory-live:motion', 'paused');
    const paused = render(view(moving('merge', ['review', 'merge'])));
    paused.rerender(view(moving('ci', ['review', 'merge', 'ci'])));
    expect(paused.container.querySelector('[data-traveller]')).toBeNull();
    expect(arriving(paused.container)).not.toHaveAttribute('data-arriving');
    paused.unmount();
    localStorage.removeItem('factory-live:motion');

    // Approved, then changes requested by another reviewer: back from Fusion to Ta revue, a step no
    // connector draws. The row stays in sight, without a trip.
    const back = render(view(moving('merge', ['review', 'merge'])));
    back.rerender(view(moving('review', ['review', 'merge', 'review'])));
    expect(back.container.querySelector('[data-traveller]')).toBeNull();
    const returned = back.container.querySelector(
      '[data-box="review"] [data-issue="cv-site#46"]',
    ) as HTMLElement;
    expect(returned).not.toHaveAttribute('data-arriving');
  });

  it('une ligne dit ce que fait l’agent : l’outil qu’il lance, ou le modèle qu’il appelle, celui de sa lane en CLI', () => {
    const agent = (state: AgentActivity['state']): AgentActivity =>
      ({
        profile: 'coder-claude',
        state,
        issueKey: null,
        cardId: null,
        model: { model: 'agnes-2.5-flash', provider: 'freellmapi', source: 'live' },
        laneModel: { model: 'claude-opus-5-5', provider: 'anthropic', source: 'live' },
        action:
          state === 'tool'
            ? {
                kind: 'tool',
                label: 'terminal',
                detail: 'npm test',
                startedAt: '2026-11-03T17:59:00Z',
              }
            : null,
      }) as AgentActivity;
    const at = (state: AgentActivity['state']) => {
      const summary = issue(
        'cv-site#52',
        'Pied de page : liens vers les réseaux',
        'implementation',
      );
      const worker = { ...agent(state), issueKey: summary.key };
      return {
        items: [{ issue: summary, box: boxOf(summary), agent: worker, intervention: null }],
        providers: providerRows([worker]),
      };
    };
    const show = (state: AgentActivity['state']) => {
      const { items, providers } = at(state);
      const view = render(
        <I18nProvider>
          <FactoryGraph
            items={items}
            providers={providers}
            selectedKey={null}
            onSelect={() => undefined}
            now={NOW}
            maxInProgress={2}
          />
        </I18nProvider>,
      );
      const facts = {
        row: row(view.container, 'cv-site#52').textContent ?? '',
        busy: [...view.container.querySelectorAll('[data-busy]')].map((line) => line.textContent),
        feeds: [...view.container.querySelectorAll('[data-active-edge^="models:"]')].map((edge) =>
          edge.getAttribute('data-active-edge'),
        ),
      };
      view.unmount();
      return facts;
    };

    // A tool runs: the row says which, and no provider answers.
    const tool = show('tool');
    expect(tool.row).toContain('terminal · npm test');
    expect(tool.row).not.toContain('agnes-2.5-flash');
    expect(tool.busy).toEqual([]);
    expect(tool.feeds).toEqual([]);
    // The agent thinks: its own model answers.
    const thinking = show('thinking');
    expect(thinking.row).toContain('coder-claude · agnes-2.5-flash');
    expect(thinking.busy).toHaveLength(1);
    expect(thinking.busy[0]).toContain('agnes-2.5-flash');
    // The feed from the providers to Implémentation flows.
    expect(thinking.feeds).toEqual(['models:implementation']);
    // It drives its Claude Code lane: the lane's model answers.
    const cli = show('cli');
    expect(cli.row).toContain('coder-claude · claude-opus-5-5');
    expect(cli.busy).toHaveLength(1);
    expect(cli.busy[0]).toContain('claude-opus-5-5');
  });

  it('une ligne typée dit encore son état aux lecteurs d’écran, que le badge du type remplace à l’écran', () => {
    const summary = {
      ...issue('claude-cockpit#76', 'E2E PR 3 : raccourcis clavier de l’île', 'implementation'),
      type: 'tests' as const,
      status: 'blocked' as const,
    };
    renderGraph([{ issue: summary, box: boxOf(summary), agent: null, intervention: null }]);
    const line = screen.getByText('E2E PR 3 : raccourcis clavier de l’île').closest('[data-issue]');
    const shown = [...(line?.querySelectorAll('[data-badge]') ?? [])].map(
      (badge) => badge.textContent,
    );
    expect(shown.join(' | ')).toContain('Tests');
    expect(within(line as HTMLElement).getByText('Bloquée')).toHaveClass('fl-visually-hidden');
  });

  it('place chaque issue dans une seule boîte, celle de sa station', () => {
    const { container } = renderGraph();
    for (const { key } of ISSUES)
      expect(container.querySelectorAll(`[data-issue="${key}"]`)).toHaveLength(1);
  });
});
