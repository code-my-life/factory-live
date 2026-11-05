import type { IssueSummary } from '@factory-live/contracts';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  contactAcceptance,
  footerAcceptance,
  graphAcceptance,
  tagsAcceptance,
} from '../../demo/acceptance.ts';
import { FactoryProvider } from '../../data/FactoryProvider.tsx';
import type { FactoryDataSource } from '../../data/source.ts';
import { AcceptanceBoard } from './AcceptanceBoard.tsx';

const AT = '2026-11-04T10:00:00.000Z';

function issue(number: number, repo = 'cv-site'): IssueSummary {
  return {
    key: `${repo}#${number}`,
    url: `https://github.com/code-my-life/${repo}/issues/${number}`,
    pr: null,
  } as IssueSummary;
}

/** The widgets in the order they show, by the name of their handle. */
function widgetOrder(): string[] {
  return screen
    .getAllByRole('button', { name: /^Déplacer/ })
    .map((handle) => handle.getAttribute('aria-label') ?? '');
}

function widget(container: HTMLElement, id: string): HTMLElement {
  return container.querySelector(`[data-widget="${id}"]`) as HTMLElement;
}

class NoResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('recette d’une PR', () => {
  // jsdom has neither `ResizeObserver` (Primer's overflow hook) nor the `popover` attribute (the
  // tooltips of Primer's icon buttons): stubbed here, as for the graph.
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', NoResizeObserver);
    // Nor `scrollIntoView`, used by the header's counts to bring their first element into sight.
    Element.prototype.scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'popover', {
      value: null,
      writable: true,
      configurable: true,
    });
    // Nor the popover methods Primer's tooltip calls when it opens, 50 ms after a hover: a slow run
    // (the CI) reaches them before the test ends.
    HTMLElement.prototype.showPopover = vi.fn();
    HTMLElement.prototype.hidePopover = vi.fn();
  });
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('montre les six widgets, chacun avec son picto de verdict, les critères repliés par défaut', () => {
    const { container } = render(<AcceptanceBoard issue={issue(44)} view={footerAcceptance(AT)} />);
    expect(widgetOrder()).toEqual([
      'Déplacer « Critères d’acceptation »',
      'Déplacer « CI et gate »',
      'Déplacer « Tests unitaires et de bout en bout »',
      'Déplacer « Preuves »',
      'Déplacer « Retours de revue »',
      'Déplacer « Jumeaux interactifs »',
    ]);
    const criteria = within(widget(container, 'criteria'));
    const toggle = criteria.getByRole('button', { name: /^NOK\s*Critères d’acceptation/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(toggle).getByRole('img', { name: 'NOK' })).toBeInTheDocument();
    expect(toggle).toHaveTextContent('1 NOK · 2 OK');
    expect(
      criteria.getByRole('img', { name: '2 OK, 1 NOK, 0 en cours, 0 à voir, sur 3' }),
    ).toBeInTheDocument();
    // The picto says the verdict: no pill beside it.
    expect(screen.queryByText('NOK', { exact: true })).not.toBeInTheDocument();
  });

  it('un élément rouge mène à son élément sur GitHub : le check, le test qui échoue, la gate', () => {
    const { container } = render(<AcceptanceBoard issue={issue(44)} view={footerAcceptance(AT)} />);
    const checks = within(widget(container, 'checks'));
    expect(
      checks.getByRole('link', { name: /^En échec\s*Bout en bout \(Chromium, WebKit\)/ }),
    ).toHaveAttribute(
      'href',
      'https://github.com/code-my-life/cv-site/actions/runs/19401876502/job/55498811302',
    );
    expect(checks.getByRole('link', { name: /factory\/gate/ })).toHaveAttribute(
      'href',
      'https://github.com/code-my-life/cv-site/pull/50#issuecomment-3497102877',
    );
    // Each rule of the gate leads to the comment that writes it, the red one first.
    expect(checks.getByRole('link', { name: /^NOK\s*CI.*en échec sur la tête/ })).toHaveAttribute(
      'href',
      'https://github.com/code-my-life/cv-site/pull/50#issuecomment-3497102877',
    );
    expect(checks.getByRole('link', { name: 'Voir sur GitHub : CI et gate' })).toHaveAttribute(
      'href',
      'https://github.com/code-my-life/cv-site/pull/50/checks',
    );
    const tests = within(widget(container, 'tests'));
    expect(
      tests.getByRole('link', { name: /^NOK\s*les liens du pied de page ouvrent un onglet sûr$/ }),
    ).toHaveAttribute(
      'href',
      'https://github.com/code-my-life/cv-site/blob/b7e19d3/e2e/footer.spec.ts#L27',
    );
  });

  it('une preuve textuelle montre son contenu tel quel', () => {
    const { container } = render(<AcceptanceBoard issue={issue(44)} view={footerAcceptance(AT)} />);
    const proofs = within(widget(container, 'proofs'));
    expect(proofs.getByText(/Received: ""/)).toBeInTheDocument();
    expect(proofs.getByText(/1 failed/)).toBeInTheDocument();
  });

  it('les preuves visuelles sont repliées par défaut, en vignettes ; une PR de 104 fichiers tient', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AcceptanceBoard issue={issue(18, 'factory-live')} view={graphAcceptance()} />,
    );
    const proofs = within(widget(container, 'proofs'));
    const disclosure = proofs.getByRole('button', { name: /6 captures avant \/ après/ });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(
      proofs.queryByRole('img', { name: 'Après : Ligne d’usine, bureau 1440 px' }),
    ).not.toBeInTheDocument();
    await user.click(disclosure);
    expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    expect(
      proofs.getByRole('img', { name: 'Après : Ligne d’usine, bureau 1440 px' }),
    ).toBeInTheDocument();
    // What the PR says it does not prove is listed for the owner, without turning the proofs red.
    expect(proofs.getByText(/ne sont pas vérifiées au geste/)).toBeInTheDocument();
    expect(proofs.getByRole('button', { name: /^OK\s*Preuves/ })).toBeInTheDocument();
    expect(
      within(widget(container, 'criteria')).getByRole('button', { name: /^OK\s*Critères.*15 OK/ }),
    ).toBeInTheDocument();
  });

  it('un lien ouvre la recette sur ses jumeaux dépliés, sans changer la disposition', async () => {
    const user = userEvent.setup();
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { container } = render(
      <AcceptanceBoard issue={issue(18, 'factory-live')} view={graphAcceptance()} focus="twins" />,
    );
    const toggle = (id: string) =>
      widget(container, id).querySelector('button[aria-expanded]') as HTMLElement;
    // Folded by default, the twins are open; the criteria, folded too, stay so.
    expect(toggle('twins')).toHaveAttribute('aria-expanded', 'true');
    expect(toggle('criteria')).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(scrolled).toHaveBeenCalled());
    expect(
      Object.keys(window.localStorage).filter((key) => key.includes('acceptance-layout')),
    ).toEqual([]);
    // Folded by the owner, they go back to the layout: folded.
    await user.click(toggle('twins'));
    expect(toggle('twins')).toHaveAttribute('aria-expanded', 'false');
  });

  it('un lien vers des jumeaux déjà dépliés les replie au premier clic', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      'factory-live:acceptance-layout:desktop',
      JSON.stringify({ order: [], pinned: [], collapsed: [], half: [] }),
    );
    const { container } = render(
      <AcceptanceBoard issue={issue(18, 'factory-live')} view={graphAcceptance()} focus="twins" />,
    );
    const toggle = widget(container, 'twins').querySelector('button[aria-expanded]') as HTMLElement;
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('les retours de revue : à traiter en tête, les résolus repliés en une ligne, chacun vers sa discussion', async () => {
    const user = userEvent.setup();
    const { container, unmount } = render(
      <AcceptanceBoard issue={issue(18, 'factory-live')} view={graphAcceptance()} />,
    );
    const threads = within(widget(container, 'threads'));
    expect(
      threads.getByRole('button', { name: /^OK\s*Retours de revue\s*10 OK/ }),
    ).toBeInTheDocument();
    expect(threads.getByText('17 revues postées sur la PR')).toBeInTheDocument();
    const resolved = threads.getByRole('button', { name: '10 retours résolus' });
    expect(resolved).toHaveAttribute('aria-expanded', 'false');
    expect(threads.queryByRole('link', { name: /Saved snapshots crash the graph/ })).toBeNull();
    await user.click(resolved);
    expect(threads.getByRole('link', { name: /Saved snapshots crash the graph/ })).toHaveAttribute(
      'href',
      'https://github.com/code-my-life/factory-live/pull/19#discussion_r4461256893',
    );
    unmount();
    const red = render(<AcceptanceBoard issue={issue(44)} view={footerAcceptance(AT)} />);
    expect(
      within(widget(red.container, 'threads')).getByRole('button', {
        name: /^NOK\s*Retours de revue/,
      }),
    ).toBeInTheDocument();
  });

  it('vert si tout est vert : la recette d’une maintenance, sans jumeaux puisque aucun écran ne change', () => {
    const { container } = render(
      <AcceptanceBoard issue={issue(68, 'claude-cockpit')} view={tagsAcceptance(AT)} />,
    );
    const title = screen.getByRole('heading', { name: 'Recette de la PR #74' });
    expect(
      within(title.parentElement as HTMLElement).getByRole('img', { name: 'OK' }),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('img', { name: 'NOK' })).toHaveLength(0);
    expect(
      within(widget(container, 'twins')).getByRole('img', { name: 'Sans objet' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Cette PR ne change aucun écran/)).toBeInTheDocument();
    // A review posted without a thread to handle still counts.
    expect(
      within(widget(container, 'threads')).getByText('1 revue postée sur la PR'),
    ).toBeInTheDocument();
  });

  it('des captures repliées disent leur pire verdict : une capture en cours n’est pas verte', () => {
    const { container } = render(
      <AcceptanceBoard issue={issue(47)} view={contactAcceptance('judging', AT)} />,
    );
    const captures = within(widget(container, 'proofs')).getByRole('button', {
      name: /1 capture avant \/ après/,
    });
    expect(captures).toHaveAttribute('aria-expanded', 'false');
    expect(captures).toHaveTextContent('1 en cours');
    expect(captures.querySelector('[data-status="pending"]')).not.toBeNull();
  });

  it('un critère non prouvé est rouge même quand la CI et la gate sont vertes', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AcceptanceBoard issue={issue(47)} view={contactAcceptance('judged', AT)} />,
    );
    await user.click(
      within(widget(container, 'criteria')).getByRole('button', {
        name: /^NOK\s*Critères d’acceptation/,
      }),
    );
    const unproven = within(widget(container, 'criteria')).getByRole('link', { name: /C4/ });
    expect(unproven).toHaveTextContent('Non prouvé, la PR le dit');
    expect(within(unproven).getByRole('img', { name: 'NOK' })).toBeInTheDocument();
    expect(
      within(widget(container, 'checks')).getByRole('button', { name: /^OK\s*CI et gate/ }),
    ).toBeInTheDocument();
  });

  it('l’en-tête compte les éléments et mène au premier NOK ; jamais « Approuver » à côté d’un rouge', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AcceptanceBoard
        issue={{ ...issue(44), pr: { reviewDecision: 'review_required' } } as IssueSummary}
        view={footerAcceptance(AT)}
      />,
    );
    const nok = screen.getByRole('button', { name: 'Aller à : 7 NOK' });
    expect(screen.getByRole('link', { name: /Ouvrir la PR sur GitHub/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Approuver sur GitHub/ })).toBeNull();
    await user.click(nok);
    const criteria = within(widget(container, 'criteria'));
    expect(criteria.getByRole('button', { name: /^NOK\s*Critères d’acceptation/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    // Not the widget only: the first red criterion itself, with the focus.
    const firstRed = criteria
      .getAllByRole('link')
      .find((link) => within(link).queryByRole('img', { name: 'NOK' }));
    await waitFor(() => expect(firstRed).toHaveFocus());
    // The OK count leads too, to the first green element.
    await user.click(screen.getByRole('button', { name: /^Aller à : \d+ OK$/ }));
    const firstGreen = criteria
      .getAllByRole('link')
      .find((link) => within(link).queryByRole('img', { name: 'OK' }));
    await waitFor(() => expect(firstGreen).toHaveFocus());
    // The PR #19 points it does not prove are counted apart, to see.
    render(<AcceptanceBoard issue={issue(18, 'factory-live')} view={graphAcceptance()} />);
    expect(screen.getByRole('button', { name: 'Aller à : 4 à voir' })).toBeInTheDocument();
  });

  it('un compte ouvre le repli qui cache son premier élément : le groupe des checks réussis', async () => {
    const user = userEvent.setup();
    const { container } = render(<AcceptanceBoard issue={issue(44)} view={footerAcceptance(AT)} />);
    const checks = within(widget(container, 'checks'));
    await user.click(checks.getByRole('button', { name: 'Épingler en tête' }));
    const group = checks.getByRole('button', { name: /checks réussis$/ });
    expect(group).toHaveAttribute('aria-expanded', 'false');
    await user.click(screen.getByRole('button', { name: /^Aller à : \d+ OK$/ }));
    await waitFor(() => expect(group).toHaveAttribute('aria-expanded', 'true'));
    const firstGreen = checks
      .getAllByRole('link')
      .find((link) => within(link).queryByRole('img', { name: 'Réussi' }));
    await waitFor(() => expect(firstGreen).toHaveFocus());
  });

  it('la disposition suit le serveur : lue au chargement, enregistrée après un changement, par type d’écran', async () => {
    const user = userEvent.setup();
    const saved = {
      order: ['twins', 'criteria', 'checks', 'tests', 'proofs', 'threads'],
      pinned: ['twins'],
      collapsed: ['criteria'],
      half: [],
    } as const;
    const getAcceptanceLayout = vi.fn(() =>
      Promise.resolve({
        ...saved,
        order: [...saved.order],
        pinned: [...saved.pinned],
        collapsed: [...saved.collapsed],
        half: [],
      }),
    );
    const saveAcceptanceLayout = vi.fn(() => Promise.resolve());
    const source = {
      subscribe: () => () => undefined,
      getAcceptanceLayout,
      saveAcceptanceLayout,
    } as unknown as FactoryDataSource;
    const { container } = render(
      <FactoryProvider source={source}>
        <AcceptanceBoard issue={issue(44)} view={footerAcceptance(AT)} />
      </FactoryProvider>,
    );
    // The server's layout for this type of screen (a desktop here) replaces the device's copy.
    expect(getAcceptanceLayout).toHaveBeenCalledWith('desktop');
    await waitFor(() => expect(widgetOrder()[0]).toBe('Déplacer « Jumeaux interactifs »'));
    // A change goes to the server once it settles, for this type of screen.
    await user.click(
      within(widget(container, 'checks')).getByRole('button', { name: 'Épingler en tête' }),
    );
    await waitFor(() => expect(saveAcceptanceLayout).toHaveBeenCalledOnce(), { timeout: 3000 });
    expect(saveAcceptanceLayout).toHaveBeenCalledWith('desktop', {
      order: ['twins', 'checks', 'criteria', 'tests', 'proofs', 'threads'],
      pinned: ['twins', 'checks'],
      collapsed: ['criteria'],
      half: [],
    });
  });

  it('téléphone et bureau gardent chacun leur disposition : passer de l’un à l’autre n’écrase rien', async () => {
    const user = userEvent.setup();
    // A window that crosses the phone's breakpoint: matchMedia says so, and tells its listeners.
    let phone = true;
    const listeners = new Set<() => void>();
    const media = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('max-width: 767px') ? phone : false,
          media: query,
          addEventListener: (_type: string, listener: () => void) => {
            listeners.add(listener);
          },
          removeEventListener: (_type: string, listener: () => void) => {
            listeners.delete(listener);
          },
        }) as unknown as MediaQueryList,
    );
    const layouts = {
      phone: {
        order: ['threads', 'criteria', 'checks', 'tests', 'proofs', 'twins'],
        pinned: [],
        collapsed: [],
        half: [],
      },
      desktop: {
        order: ['tests', 'criteria', 'checks', 'proofs', 'threads', 'twins'],
        pinned: [],
        collapsed: [],
        half: [],
      },
    };
    const saveAcceptanceLayout = vi.fn(() => Promise.resolve());
    const source = {
      subscribe: () => () => undefined,
      getAcceptanceLayout: (device: 'phone' | 'desktop') =>
        Promise.resolve(structuredClone(layouts[device])),
      saveAcceptanceLayout,
    } as unknown as FactoryDataSource;
    try {
      const { container } = render(
        <FactoryProvider source={source}>
          <AcceptanceBoard issue={issue(44)} view={footerAcceptance(AT)} />
        </FactoryProvider>,
      );
      await waitFor(() => expect(widgetOrder()[0]).toBe('Déplacer « Retours de revue »'));
      // An edit on the phone, then the window widens before it is sent.
      await user.click(
        within(widget(container, 'checks')).getByRole('button', { name: 'Épingler en tête' }),
      );
      phone = false;
      act(() => listeners.forEach((listener) => listener()));
      // The desktop shows its own layout; the phone's edit went to the phone, never to the desktop.
      await waitFor(() =>
        expect(widgetOrder()[0]).toBe('Déplacer « Tests unitaires et de bout en bout »'),
      );
      expect(saveAcceptanceLayout).toHaveBeenCalledOnce();
      expect(saveAcceptanceLayout).toHaveBeenCalledWith(
        'phone',
        expect.objectContaining({ pinned: ['checks'] }),
      );
    } finally {
      media.mockRestore();
    }
  });

  it('les jumeaux : les surfaces de la PR, le miroir des gestes, et la divergence qui propose de piloter séparément', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AcceptanceBoard issue={issue(18, 'factory-live')} view={graphAcceptance()} />,
    );
    const twins = within(widget(container, 'twins'));
    const toggle = twins.getByRole('button', { name: /^À voir\s*Jumeaux interactifs/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    for (const surface of ['App', 'Serveur', 'Site', 'Doc'])
      expect(twins.getByRole('button', { name: surface })).toBeInTheDocument();
    expect(twins.getByRole('img', { name: 'L’écran Après, c0c69e3' })).toBeInTheDocument();
    expect(twins.getByText('14 différences sur cet écran', { exact: false })).toBeInTheDocument();
    expect(twins.getByText('Le miroir attend')).toBeInTheDocument();
    await user.click(twins.getByRole('button', { name: 'Piloter séparément' }));
    expect(
      twins.getByText('Tu pilotes chaque jumeau séparément.', { exact: false }),
    ).toBeInTheDocument();
    expect(twins.queryByText('Le miroir attend')).toBeNull();
  });

  it('épingler met le widget en tête, le dit aux lecteurs d’écran et garde la disposition', async () => {
    const user = userEvent.setup();
    const { container, unmount } = render(
      <AcceptanceBoard issue={issue(44)} view={footerAcceptance(AT)} />,
    );
    await user.click(
      within(widget(container, 'twins')).getByRole('button', { name: 'Épingler en tête' }),
    );
    expect(widgetOrder()[0]).toBe('Déplacer « Jumeaux interactifs »');
    expect(screen.getByText('Jumeaux interactifs : épinglé en tête')).toHaveAttribute(
      'role',
      'status',
    );
    unmount();
    render(<AcceptanceBoard issue={issue(47)} view={contactAcceptance('judged', AT)} />);
    expect(widgetOrder()[0]).toBe('Déplacer « Jumeaux interactifs »');
  });

  it('la poignée déplace au clavier, sans faire passer un widget au-dessus des épinglés', async () => {
    const user = userEvent.setup();
    render(<AcceptanceBoard issue={issue(44)} view={footerAcceptance(AT)} />);
    const tests = screen.getByRole('button', {
      name: 'Déplacer « Tests unitaires et de bout en bout »',
    });
    tests.focus();
    await user.keyboard('{ArrowUp}');
    expect(widgetOrder().slice(0, 3)).toEqual([
      'Déplacer « Critères d’acceptation »',
      'Déplacer « Tests unitaires et de bout en bout »',
      'Déplacer « CI et gate »',
    ]);
    expect(
      screen.getByText('Tests unitaires et de bout en bout : position 2 sur 6'),
    ).toBeInTheDocument();
  });
});
