import { StudioWord } from '@factory-live/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App.tsx';
import { AppShell } from '../../app/AppShell.tsx';
import { ColorModeProvider } from '../../app/colorMode.tsx';
import { FactoryProvider } from '../../data/FactoryProvider.tsx';
import { DemoSource } from '../../demo/DemoSource.ts';
import { DEMO_WORDS, PRESENTER_SCRIPT, derivedWords, spokenText } from '../../demo/studio.ts';
import { I18nProvider } from '../../i18n/I18nProvider.tsx';
import { frameOf } from '../../ui/media/index.ts';
import { MotionProvider } from '../../ui/motion.tsx';
import { STUDIO_SHEET, pathTo } from '../studio/model.ts';
import { createDemoStudioSource, createLiveStudioSource } from '../studio/source.ts';
import type { StudioSource } from '../studio/source.ts';
import { StudioPage } from '../studio/StudioPage.tsx';
import { StudioProvider } from '../studio/StudioProvider.tsx';
import { InterventionsPage } from './InterventionsPage.tsx';

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
  vi.unstubAllEnvs();
});

/** The app's shell over the interventions and the studio, on the demos of the factory and the studio. */
function renderApp(route: string, factory: DemoSource, studio?: StudioSource) {
  return render(
    <I18nProvider>
      <ColorModeProvider>
        <MotionProvider>
          <FactoryProvider source={factory}>
            <StudioProvider {...(studio ? { source: studio } : {})}>
              <MemoryRouter initialEntries={[route]}>
                <Routes>
                  <Route path="/" element={<AppShell />}>
                    <Route path="interventions" element={<InterventionsPage />} />
                    <Route path="interventions/:id" element={<InterventionsPage />} />
                    <Route path="studio" element={<StudioPage />} />
                    <Route path="studio/:video" element={<StudioPage />} />
                  </Route>
                </Routes>
              </MemoryRouter>
            </StudioProvider>
          </FactoryProvider>
        </MotionProvider>
      </ColorModeProvider>
    </I18nProvider>,
  );
}

const openInterventions = (factory: DemoSource) =>
  factory.getSnapshot().interventions.filter((intervention) => !intervention.resolvedAt).length;

describe('InterventionsPage', () => {
  it('les vidéos qui t’attendent rejoignent les interventions', async () => {
    const user = userEvent.setup();
    const factory = new DemoSource();
    const { container } = renderApp('/interventions', factory, createDemoStudioSource());
    const list = screen.getByRole('navigation', { name: 'Interventions en attente' });

    // The three videos that wait for the owner, each with its badge « Studio », among the others.
    await waitFor(() => expect(list.querySelectorAll('[data-studio]')).toHaveLength(3));
    const videos = [...list.querySelectorAll('[data-studio]')] as HTMLElement[];
    for (const video of videos)
      expect(
        within(video).getByText('Studio', { selector: '[data-segment="label"] *' }),
      ).toBeVisible();
    expect(videos.map((video) => video.querySelector('[class*="itemTitle"]')?.textContent)).toEqual(
      expect.arrayContaining([
        'Mon usine à code, en direct sur mon téléphone',
        'La recette d’une PR, sans lire une ligne de code',
        'Un agent bloque : je réponds depuis mon téléphone',
      ]),
    );
    // Mixed with the factory's: a video sorts as an open intervention to handle, after the blocking ones.
    const items = [...(list.querySelector('ul') as HTMLElement).querySelectorAll('a')];
    expect(items.length).toBeGreaterThan(3);
    const critical = items.filter((item) => item.getAttribute('data-tone') === 'danger');
    for (const item of critical)
      expect(items.indexOf(item)).toBeLessThan(items.indexOf(videos[0] as HTMLAnchorElement));

    // The bell counts the open interventions and the videos that wait; Studio counts its own.
    const bell = () =>
      screen
        .getByRole('button', { name: /^Interventions : \d+ en attente$/ })
        .getAttribute('aria-label');
    expect(bell()).toBe(`Interventions : ${openInterventions(factory) + 3} en attente`);
    const tabs = screen.getByRole('navigation', { name: 'Navigation' });
    expect(within(tabs).getByRole('link', { name: /Studio/ })).toHaveTextContent('3');

    // A video opens at `/interventions/studio:<video>`, with the same gesture as on the studio's page.
    await user.click(within(list).getByRole('link', { name: /Mon usine à code/ }));
    const gesture = await screen.findByRole('region', { name: 'Geste' });
    expect(within(gesture).getByText('Le master attend ta revue')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir dans le Studio' })).toHaveAttribute(
      'href',
      '/studio/presenter-factory-live',
    );
    await user.click(within(gesture).getByRole('button', { name: 'Valider' }));

    // Approved, it goes on to Publication and waits no more: it leaves the list and the bell.
    await waitFor(() => expect(list.querySelectorAll('[data-studio]')).toHaveLength(2));
    expect(bell()).toBe(`Interventions : ${openInterventions(factory) + 2} en attente`);
    expect(screen.getByText('Cette intervention est résolue.')).toBeInTheDocument();
    expect(container.querySelector('[data-studio][aria-current="page"]')).toBeNull();
  });

  it('le formulaire de « Refaire » ne suit pas d’une vidéo à l’autre', async () => {
    const user = userEvent.setup();
    const studio = createDemoStudioSource();
    const gestures = vi.spyOn(studio, 'gesture');
    renderApp('/interventions/studio:presenter-factory-live', new DemoSource(), studio);
    const list = screen.getByRole('navigation', { name: 'Interventions en attente' });
    let gesture = await screen.findByRole('region', { name: 'Geste' });
    expect(within(gesture).getByText('Le master attend ta revue')).toBeInTheDocument();
    await user.click(within(gesture).getByRole('button', { name: 'Refaire…' }));
    await user.type(within(gesture).getByRole('textbox', { name: 'Raison' }), 'Trop long');

    // Another video opens with its own gesture: the form is closed and its reason empty.
    await user.click(within(list).getByRole('link', { name: /La recette d’une PR/ }));
    await waitFor(() =>
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'La recette d’une PR, sans lire une ligne de code',
        }),
      ).toBeInTheDocument(),
    );
    gesture = screen.getByRole('region', { name: 'Geste' });
    expect(within(gesture).queryByRole('textbox', { name: 'Raison' })).toBeNull();
    expect(within(gesture).queryByRole('button', { name: 'Envoyer' })).toBeNull();
    expect(within(gesture).getByRole('button', { name: 'Refaire…' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await user.click(within(gesture).getByRole('button', { name: 'Refaire…' }));
    expect(within(gesture).getByRole('textbox', { name: 'Raison' })).toHaveValue('');
    expect(gestures).not.toHaveBeenCalled();
  });

  it('en Tournage, la vidéo ouverte dans les interventions a le lien des prises', async () => {
    renderApp('/interventions/studio:un-agent-bloque', new DemoSource(), createDemoStudioSource());
    const gesture = await screen.findByRole('region', { name: 'Geste' });
    expect(
      await within(gesture).findByRole('link', { name: 'Ouvrir la page des prises' }),
    ).toHaveAttribute('href', 'http://localhost:8447/videos/un-agent-bloque/prises');
  });

  it('une vidéo seule, sans intervention de la factory, s’ouvre la première', async () => {
    const factory = new DemoSource();
    vi.spyOn(factory, 'getSnapshot').mockReturnValue({
      ...factory.getSnapshot(),
      interventions: [],
    });
    renderApp('/interventions', factory, createDemoStudioSource());
    // The first video to handle opens by itself.
    const gesture = await screen.findByRole('region', { name: 'Geste' });
    expect(within(gesture).getByRole('button', { name: 'Valider' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Interventions : 3 en attente' }),
    ).toBeInTheDocument();
  });
});

/*
 * The studio's states, read through its page and its gesture (the studio's own tests are written by
 * the factory and stay as they are; these complete them).
 */
describe('le Studio, ses états et sa source', () => {
  const renderStudio = (route: string, studio: StudioSource = createDemoStudioSource()) =>
    renderApp(route, new DemoSource(), studio);
  const detail = () => screen.findByRole('region', { name: 'Geste' });

  it('une voie en échec se relance ; une vidéo publiée a son lien ; Publication reste vide', async () => {
    const user = userEvent.setup();
    const { container } = renderStudio('/studio/la-barriere-avant-moi');
    const gesture = await detail();
    expect(gesture).toHaveTextContent('Voie en échec');
    expect(gesture).toHaveTextContent('montage en échec : compose a dépassé la durée visée');
    // The journal: the step that failed.
    expect(screen.getByText('échec : durée 66,4 s, au-delà de 65 s')).toBeInTheDocument();
    expect(within(gesture).queryByRole('button', { name: 'Refaire…' })).toBeNull();
    await user.click(within(gesture).getByRole('button', { name: 'Relancer' }));
    await waitFor(() =>
      expect(
        container.querySelector('[data-box="montage"] [data-issue="la-barriere-avant-moi"]'),
      ).not.toHaveAttribute('data-tone', 'danger'),
    );
    expect(await detail()).toHaveTextContent('Rien n’attend ton geste à cette station.');
    expect(container.querySelector('[data-box="publication"] [data-issue]')).toBeNull();

    const published = renderStudio('/studio/neuf-postes');
    const article = await within(published.container).findByRole('article');
    expect(within(article).getByRole('link', { name: /Voir la publication/ })).toHaveAttribute(
      'href',
      'https://example.com/neuf-postes',
    );
    expect(within(article).getByText(/publish/)).toBeInTheDocument();
    expect(within(article).getByText('Contrôle qualité')).toBeInTheDocument();
  });

  it('sans master ni mots calés, la vidéo le dit ; en Tournage, la page des prises', async () => {
    const first = renderStudio('/studio/factory-live-tombe');
    const article = await within(first.container).findByRole('article');
    expect(article).toHaveTextContent('pas encore de master');
    expect(article).toHaveTextContent('pas encore de mots calés');
    expect(article).toHaveTextContent('Pas encore de script.');
    expect(article).toHaveTextContent('Aucune étape de vf run pour l’instant.');
    expect(article).toHaveTextContent('Pas encore de master');
    first.unmount();

    const shooting = renderStudio('/studio/un-agent-bloque');
    const gesture = await detail();
    expect(
      within(gesture).getByRole('link', { name: 'Ouvrir la page des prises' }),
    ).toHaveAttribute('href', 'http://localhost:8447/videos/un-agent-bloque/prises');
    // Tournage has no return: no « Refaire ».
    expect(within(gesture).queryByRole('button', { name: 'Refaire…' })).toBeNull();
    shooting.unmount();

    // A draft shows its script as written.
    const draft = renderStudio('/studio/coulisses-de-la-recette');
    expect(await within(draft.container).findByText(/Je lis sa recette/)).toBeInTheDocument();
  });

  it('le master à revoir : ses repères, son trajet, et le script en mots calés dérivés pour la démo', async () => {
    const user = userEvent.setup();
    const { container } = renderStudio('/studio/presenter-factory-live');
    const article = await within(container).findByRole('article');
    const words = DEMO_WORDS['presenter-factory-live'] ?? [];
    expect(article).toHaveTextContent(`${words.length} mots`);
    expect(article).toHaveTextContent('Démo : mots dérivés du script à cadence fixe');
    expect(within(article).getByRole('link', { name: /Page du studio/ })).toBeInTheDocument();
    // The journey up to its station.
    expect(article.querySelector('[aria-current="step"]')).toHaveTextContent('Revue');

    // Touching a word brings the player to its frame, and lights it.
    const track = within(article).getByRole('group', { name: 'Mots calés' });
    const word = words.find((candidate) => candidate.mot === 'factory-live.');
    await user.click(within(track).getByRole('button', { name: 'factory-live.' }));
    expect(within(article).getByRole('group', { name: /^Master/ })).toHaveTextContent(
      `image ${frameOf(word?.debut ?? 0)} / ${frameOf(words[words.length - 1]?.fin ?? 0) + 1}`,
    );
    expect(within(track).getByRole('button', { name: 'factory-live.' })).toHaveAttribute(
      'aria-current',
      'true',
    );

    // Touching the open video's row closes it.
    await user.click(
      within(
        container.querySelector('[data-issue="presenter-factory-live"]') as HTMLElement,
      ).getByRole('button'),
    );
    expect(
      await screen.findByText('Touche une vidéo dans le graphe pour ouvrir son détail ici.'),
    ).toBeVisible();
  });

  it('une vidéo inconnue, et un geste que le studio refuse, le disent', async () => {
    const user = userEvent.setup();
    renderStudio('/studio/inconnue');
    expect(await screen.findByText('Cette vidéo n’est pas dans le studio.')).toBeInTheDocument();

    const demo = createDemoStudioSource();
    const refusing: StudioSource = {
      ...demo,
      gesture: () => Promise.resolve({ ok: false, error: 'refused' }),
    };
    renderStudio('/studio/presenter-factory-live', refusing);
    const gesture = await detail();
    await user.click(within(gesture).getByRole('button', { name: 'Refaire…' }));
    await user.type(within(gesture).getByRole('textbox', { name: 'Raison' }), 'Trop long');
    await user.click(within(gesture).getByRole('button', { name: 'Envoyer' }));
    expect(await within(gesture).findByRole('alert')).toHaveTextContent(
      'Le studio a refusé ce geste. Réessaie.',
    );
    await user.click(within(gesture).getByRole('button', { name: 'Annuler' }));
    expect(within(gesture).queryByRole('textbox', { name: 'Raison' })).toBeNull();
  });

  it('sans source donnée, le studio du build : la démo, ou celui que suit le serveur sur live, avec son état', async () => {
    const demo = renderApp('/studio', new DemoSource());
    await waitFor(() =>
      expect(demo.container.querySelector('[data-issue="presenter-factory-live"]')).not.toBeNull(),
    );
    expect(screen.getByText('3 vidéos t’attendent')).toBeInTheDocument();
    demo.unmount();

    // The live build reads the studio through this server: here it follows none.
    vi.stubEnv('VITE_DATA_SOURCE', 'live');
    const answer = { current: Response.json({ error: 'Workflow inconnu' }, { status: 404 }) };
    vi.stubGlobal('fetch', () => Promise.resolve(answer.current.clone()));
    const none = renderApp('/studio', new DemoSource());
    expect(
      await screen.findByText(
        'Ce serveur ne suit aucun studio : WORKFLOWS dans la configuration (RUNBOOK).',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Aucune vidéo ne t’attend')).toBeInTheDocument();
    expect(none.container.querySelector('[data-issue]')).toBeNull();
    expect(screen.queryByRole('link', { name: /^Studio/ })).toBeNull();
    // The bell counts the factory's interventions only.
    expect(
      screen.getByRole('button', { name: /^Interventions : \d+ en attente$/ }),
    ).toHaveAccessibleName(`Interventions : ${openInterventions(new DemoSource())} en attente`);
    none.unmount();

    // A studio that stopped answering: its last state stays, and the page says so.
    if (!STUDIO_SHEET.ok) throw new Error(STUDIO_SHEET.error);
    answer.current = Response.json({
      name: 'studio',
      sheet: STUDIO_SHEET.sheet,
      sheetError: null,
      items: [
        {
          id: 'essai',
          card: 't_studio1',
          title: 'Une vidéo d’essai',
          station: 'revue',
          state: 'waiting',
          since: new Date(Date.now() - 60_000).toISOString(),
          waits: 'Regarder le master',
          failure: null,
        },
      ],
      readAt: Date.now() - 120_000,
      unreachableSince: Date.now() - 90_000,
      error: 'fetch failed',
    });
    const live = renderApp('/studio', new DemoSource());
    expect(await screen.findByText('Le studio ne répond pas')).toBeInTheDocument();
    expect(screen.getByText(/fetch failed/)).toBeInTheDocument();
    await waitFor(() =>
      expect(live.container.querySelector('[data-issue="essai"]')).not.toBeNull(),
    );
    expect(screen.getByText('1 vidéo t’attend')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('l’app monte le studio : le jeton #studio ouvre sa page, et son entrée compte les vidéos', async () => {
    vi.stubEnv('VITE_ROUTER', 'memory');
    window.location.hash = '#studio';
    try {
      const { container } = render(<App />);
      expect(await screen.findByRole('heading', { level: 1, name: 'Studio' })).toBeInTheDocument();
      await waitFor(() =>
        expect(container.querySelector('[data-issue="presenter-factory-live"]')).not.toBeNull(),
      );
      const side = screen.getByRole('navigation', { name: 'Navigation principale' });
      expect(within(side).getByRole('link', { name: /Studio/ })).toHaveTextContent('3');
    } finally {
      window.location.hash = '';
    }
  });

  it('la source : chaque démo a son état, les gestes impossibles sont refusés, le direct est vide', async () => {
    const one = createDemoStudioSource();
    const other = createDemoStudioSource();
    expect((await one.gesture('presenter-factory-live', { decision: 'ok' })).ok).toBe(true);
    expect((await one.item('presenter-factory-live'))?.station).toBe('publication');
    expect((await other.item('presenter-factory-live'))?.station).toBe('revue');
    // Its items carry no detail.
    expect(Object.keys((await one.items())[0] ?? {})).not.toContain('script');

    // Nothing to do at a running station, no return at Tournage, an unknown video, no sheet.
    expect((await one.gesture('le-cadrage-reste-humain', { decision: 'ok' })).ok).toBe(false);
    expect((await one.gesture('un-agent-bloque', { decision: 'refaire', note: 'Encore' })).ok).toBe(
      false,
    );
    expect((await one.gesture('inconnue', { decision: 'ok' })).ok).toBe(false);
    expect((await createDemoStudioSource(null).gesture('neuf-postes', { decision: 'ok' })).ok).toBe(
      false,
    );
    // From Approbation, « ok » sends the video to Tournage, which waits for the owner too.
    await one.gesture('coulisses-de-la-recette', { decision: 'ok' });
    expect(await one.item('coulisses-de-la-recette')).toMatchObject({
      station: 'tournage',
      state: 'waiting',
    });
    // From Publication, the end.
    expect((await one.words('inconnue')).length).toBe(0);

    // A server that follows no studio answers 404: an empty studio, its tab hidden.
    const live = createLiveStudioSource(() =>
      Promise.resolve(
        Response.json({ error: 'Workflow inconnu', code: 'not_found' }, { status: 404 }),
      ),
    );
    expect((await live.status()).configured).toBe(false);
    expect(await live.items()).toEqual([]);
    expect(await live.item('presenter-factory-live')).toBeNull();
    expect(await live.words('presenter-factory-live')).toEqual([]);
    expect(await live.agents()).toEqual([]);
    expect((await live.gesture('presenter-factory-live', { decision: 'ok' })).ok).toBe(false);
  });

  it('les mots de la démo sont dérivés du vrai script, sur la grille de 30 images, et tiennent le contrat', () => {
    // The YAML head and the annotations between brackets are not said.
    const said = spokenText(PRESENTER_SCRIPT);
    expect(said).not.toContain('duree_visee');
    expect(said).not.toContain('[capture');
    const words = derivedWords(PRESENTER_SCRIPT);
    expect(words[0]).toEqual({ mot: 'Mes', debut: 0.5, fin: 0.8, garde: true });
    expect(words[1]).toMatchObject({ mot: 'outils', debut: 0.8 });
    for (const word of words) expect(StudioWord.safeParse(word).success).toBe(true);
    expect(StudioWord.safeParse({ mot: 'x', debut: 1, fin: 1, garde: true }).success).toBe(false);
    // A station off the line is its own way.
    if (!STUDIO_SHEET.ok) throw new Error(STUDIO_SHEET.error);
    expect(pathTo(STUDIO_SHEET.sheet, 'ailleurs')).toEqual(['ailleurs']);
    expect(pathTo(STUDIO_SHEET.sheet, 'revue')).toEqual([
      'idee',
      'script',
      'approbation',
      'tournage',
      'montage',
      'revue',
    ]);
  });
});
