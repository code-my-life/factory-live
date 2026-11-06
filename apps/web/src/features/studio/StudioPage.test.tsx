import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider.tsx';
import { MotionProvider } from '../../ui/motion.tsx';
import { createDemoStudioSource } from './source.ts';
import type { StudioSource } from './source.ts';
import { StudioPage } from './StudioPage.tsx';
import { StudioProvider } from './StudioProvider.tsx';

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

function renderStudio(route: string, source: StudioSource = createDemoStudioSource()) {
  return render(
    <I18nProvider>
      <MotionProvider>
        <StudioProvider source={source}>
          <MemoryRouter initialEntries={[route]}>
            <Routes>
              <Route path="/studio" element={<StudioPage />} />
              <Route path="/studio/:video" element={<StudioPage />} />
            </Routes>
          </MemoryRouter>
        </StudioProvider>
      </MotionProvider>
    </I18nProvider>,
  );
}

const box = (container: HTMLElement, key: string) =>
  container.querySelector<HTMLElement>(`[data-box="${key}"]`);
const row = (container: HTMLElement, key: string, video: string) =>
  container.querySelector(`[data-box="${key}"] [data-issue="${video}"]`);

describe('StudioPage', () => {
  it('les huit postes du studio se dessinent avec leur nature et les fournisseurs', async () => {
    const { container } = renderStudio('/studio');
    await waitFor(() => expect(box(container, 'idee')).not.toBeNull());

    // Each station of the studio's sheet, named by the sheet, says who does its work.
    for (const [key, label, kind, word] of [
      ['idee', 'Idée', 'script', 'Script'],
      ['script', 'Script', 'ai', 'IA'],
      ['approbation', 'Approbation', 'owner', 'Toi'],
      ['tournage', 'Tournage', 'owner', 'Toi'],
      ['montage', 'Montage', 'script', 'Script'],
      ['revue', 'Revue', 'owner', 'Toi'],
      ['publication', 'Publication', 'script', 'Script'],
    ] as const) {
      const station = box(container, key);
      expect(station, key).not.toBeNull();
      expect(station, key).toHaveTextContent(label);
      const chip = station?.querySelector('[data-kind]');
      expect(chip, key).toHaveAttribute('data-kind', kind);
      expect(chip, key).toHaveTextContent(word);
    }
    // The end does no work: no chip.
    const end = box(container, 'publiee');
    expect(end).toHaveTextContent('Publiée');
    expect(end?.querySelector('[data-kind]')).toBeNull();

    // The providers: studio-writer and its model, under the one station where an agent calls one.
    const providers = box(container, 'models');
    expect(providers).not.toBeNull();
    expect(providers).toHaveTextContent('Fournisseurs');
    expect(providers).toHaveTextContent('studio-writer');
    expect(container.querySelectorAll('[data-box]')).toHaveLength(9);

    // The demo's videos stand at their stations; Publication is empty.
    expect(row(container, 'revue', 'presenter-factory-live')).not.toBeNull();
    expect(row(container, 'approbation', 'coulisses-de-la-recette')).not.toBeNull();
    expect(row(container, 'tournage', 'un-agent-bloque')).not.toBeNull();
    expect(row(container, 'montage', 'la-barriere-avant-moi')).not.toBeNull();
    expect(row(container, 'script', 'le-cadrage-reste-humain')).not.toBeNull();
    expect(box(container, 'publication')?.querySelector('[data-issue]')).toBeNull();
  });

  it('valider ou refaire avec une raison, à une station qui t’attend', async () => {
    const user = userEvent.setup();
    const source = createDemoStudioSource();

    // The source refuses a « refaire » with no reason, and the video stays where it is.
    const refused = await source.gesture('coulisses-de-la-recette', {
      decision: 'refaire',
      note: '   ',
    });
    expect(refused.ok).toBe(false);
    expect((await source.item('coulisses-de-la-recette'))?.station).toBe('approbation');

    const { container } = renderStudio('/studio', source);
    await waitFor(() =>
      expect(row(container, 'approbation', 'coulisses-de-la-recette')).not.toBeNull(),
    );

    // Touching a video opens its detail, with the gesture of a station that waits for the owner.
    const title = within(
      row(container, 'approbation', 'coulisses-de-la-recette') as HTMLElement,
    ).getByRole('button');
    await user.click(title);
    const gesture = await screen.findByRole('region', { name: 'Geste' });
    expect(within(gesture).getByRole('button', { name: 'Valider' })).toBeInTheDocument();
    await user.click(within(gesture).getByRole('button', { name: 'Refaire…' }));

    // « Refaire » with no reason sends nothing.
    const reason = within(gesture).getByRole('textbox', { name: 'Raison' });
    const send = within(gesture).getByRole('button', { name: 'Envoyer' });
    await user.click(send);
    expect((await source.item('coulisses-de-la-recette'))?.station).toBe('approbation');
    expect(row(container, 'approbation', 'coulisses-de-la-recette')).not.toBeNull();

    // With a reason, the video goes back along the station's return: to Script.
    await user.type(reason, 'Le ton est trop sec');
    await user.click(send);
    await waitFor(() => expect(row(container, 'script', 'coulisses-de-la-recette')).not.toBeNull());
    expect((await source.item('coulisses-de-la-recette'))?.station).toBe('script');

    // « Valider » sends the video down the line: from Revue to Publication.
    const other = renderStudio('/studio/presenter-factory-live', source);
    const approve = within(
      await within(other.container).findByRole('region', { name: 'Geste' }),
    ).getByRole('button', { name: 'Valider' });
    await user.click(approve);
    await waitFor(() =>
      expect(row(other.container, 'publication', 'presenter-factory-live')).not.toBeNull(),
    );
    expect((await source.item('presenter-factory-live'))?.station).toBe('publication');
  });

  it("l'id d'une vidéo s'affiche entier dans sa ligne", async () => {
    const { container } = renderStudio('/studio');
    await waitFor(() => expect(row(container, 'revue', 'presenter-factory-live')).not.toBeNull());

    // A video's id has no « # »: it is not cut into a repository label and a number.
    const line = row(container, 'revue', 'presenter-factory-live') as HTMLElement;
    const badge = line.querySelector('[data-badge]');
    expect(badge).toHaveAttribute('title', 'presenter-factory-live');
    expect(badge?.querySelector('[data-segment="label"]')).toBeNull();
    const value = badge?.querySelector('[data-segment="value"]');
    expect(value).toHaveTextContent('presenter-factory-live');
    for (const label of line.querySelectorAll('[data-segment="label"]'))
      expect(label.textContent).not.toBe('presenter-factory-liv');
  });

  const DERIVED = 'Démo : mots dérivés du script à cadence fixe, pas ceux d’un master.';

  it("la note des mots dérivés n'apparaît pas sur vitrine-factory-live", async () => {
    renderStudio('/studio/vitrine-factory-live');
    // Its words are those of its master: they show, without the note.
    const words = await screen.findByRole('group', { name: 'Mots calés' });
    expect(words.textContent).not.toBe('');
    expect(screen.queryByText(DERIVED)).toBeNull();
  });

  it('la note des mots dérivés reste sur presenter-factory-live', async () => {
    renderStudio('/studio/presenter-factory-live');
    const words = await screen.findByRole('group', { name: 'Mots calés' });
    expect(words.textContent).not.toBe('');
    expect(screen.getByText(DERIVED)).toBeInTheDocument();
  });
});
