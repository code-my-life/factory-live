import type { Snapshot } from '@factory-live/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColorModeProvider } from '../../app/colorMode.tsx';
import { FactoryProvider } from '../../data/FactoryProvider.tsx';
import type { FactoryDataSource } from '../../data/source.ts';
import { I18nProvider } from '../../i18n/I18nProvider.tsx';
import { SettingsPage } from './SettingsPage.tsx';

const snapshot = { health: [] } as unknown as Snapshot;
const source = {
  kind: 'demo',
  subscribe: () => () => undefined,
  getSnapshot: () => snapshot,
} as unknown as FactoryDataSource;

function renderSettings() {
  return render(
    <I18nProvider>
      <ColorModeProvider>
        <FactoryProvider source={source}>
          <MemoryRouter>
            <SettingsPage />
          </MemoryRouter>
        </FactoryProvider>
      </ColorModeProvider>
    </I18nProvider>,
  );
}

function browserLanguage(language: string) {
  vi.spyOn(window.navigator, 'language', 'get').mockReturnValue(language);
}

describe('Réglages, langue', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('s’ouvre dans la langue du navigateur : français s’il est en français', () => {
    browserLanguage('fr-FR');
    renderSettings();
    expect(screen.getByRole('heading', { level: 1, name: 'Réglages' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('fr');
    expect(screen.getByRole('button', { name: 'Français' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('s’ouvre en anglais pour toute autre langue du navigateur', () => {
    browserLanguage('de-DE');
    renderSettings();
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });

  it('bascule tout de suite, sans recharger, et garde le choix pour la prochaine ouverture', async () => {
    browserLanguage('fr-FR');
    const { unmount } = renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Language' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('factory-live:locale')).toBe('en');
    unmount();

    renderSettings();
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Français' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Réglages' })).toBeInTheDocument();
    expect(localStorage.getItem('factory-live:locale')).toBe('fr');
  });

  it('nomme chaque langue dans sa langue, balisée pour les lecteurs d’écran', () => {
    browserLanguage('en-US');
    renderSettings();
    expect(screen.getByRole('button', { name: 'Français' })).toHaveAttribute('lang', 'fr');
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('lang', 'en');
  });
});
