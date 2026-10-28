import type { GitHubAccess } from '@factory-live/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FactoryProvider } from '../../data/FactoryProvider.tsx';
import type { FactoryDataSource } from '../../data/source.ts';
import { LiveGitHubSection } from './GitHubSection.tsx';

function liveSource(access: GitHubAccess | null, logout = vi.fn(() => Promise.resolve())) {
  return {
    kind: 'live',
    subscribe: () => () => undefined,
    getGitHubAccess: () => access,
    logoutGitHub: logout,
  } as unknown as FactoryDataSource;
}

const APP = {
  slug: 'factory-live-code-my-life',
  url: 'https://github.com/apps/factory-live-code-my-life',
  installUrl: 'https://github.com/apps/factory-live-code-my-life/installations/new',
};

describe('LiveGitHubSection', () => {
  it('attend la réponse du serveur avant de proposer quoi que ce soit', () => {
    render(
      <FactoryProvider source={liveSource(null)}>
        <LiveGitHubSection />
      </FactoryProvider>,
    );
    expect(screen.getByText('Lecture de l’accès GitHub…')).toBeInTheDocument();
  });

  it('mène aux pages du serveur pour créer l’App, l’installer et se connecter', () => {
    render(
      <FactoryProvider
        source={liveSource({
          mode: 'app',
          app: { ...APP, installed: false },
          user: null,
          setupUrl: '/api/github/setup',
          loginUrl: '/api/github/login',
        })}
      >
        <LiveGitHubSection />
      </FactoryProvider>,
    );
    expect(screen.getByRole('link', { name: 'Installer sur les dépôts' })).toHaveAttribute(
      'href',
      APP.installUrl,
    );
    expect(screen.getByRole('link', { name: 'Se connecter à GitHub' })).toHaveAttribute(
      'href',
      '/api/github/login',
    );
    expect(screen.queryByText(/Démo/)).toBeNull();
  });

  it('déconnecte par une écriture au serveur, et dit pourquoi elle échoue', async () => {
    const logout = vi.fn(() => Promise.reject(new Error('Écriture réservée à ce PC')));
    render(
      <FactoryProvider
        source={liveSource(
          {
            mode: 'app',
            app: { ...APP, installed: true },
            user: { login: 'cddev', avatarUrl: null, expiresAt: '2026-10-29T02:00:00.000Z' },
            setupUrl: '/api/github/setup',
            loginUrl: '/api/github/login',
          },
          logout,
        )}
      >
        <LiveGitHubSection />
      </FactoryProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    expect(logout).toHaveBeenCalledOnce();
    expect(await screen.findByText('Écriture réservée à ce PC')).toBeInTheDocument();
  });
});
