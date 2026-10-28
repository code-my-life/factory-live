import type { GitHubAccess } from '@factory-live/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GitHubAccessPanel } from './GitHubAccessPanel.tsx';
import type { GitHubActions } from './GitHubAccessPanel.tsx';

const APP = {
  slug: 'factory-live-code-my-life',
  url: 'https://github.com/apps/factory-live-code-my-life',
  installUrl: 'https://github.com/apps/factory-live-code-my-life/installations/new',
};
const access = (patch: Partial<GitHubAccess>): GitHubAccess => ({
  mode: 'none',
  app: null,
  user: null,
  setupUrl: '/api/github/setup',
  loginUrl: '/api/github/login',
  ...patch,
});
const links: GitHubActions = {
  create: { href: '/api/github/setup' },
  install: { href: APP.installUrl },
  login: { href: '/api/github/login' },
  logout: { onClick: () => undefined },
};

describe('GitHubAccessPanel', () => {
  it('sans App, propose de la créer, et dit d’où viennent les lectures en attendant', () => {
    render(<GitHubAccessPanel access={access({ mode: 'token' })} actions={links} demo={false} />);
    expect(screen.getByText(/lit GitHub avec le jeton de repli/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Créer l’App sur GitHub' })).toHaveAttribute(
      'href',
      '/api/github/setup',
    );
    expect(screen.queryByText('Ton compte')).toBeNull();
  });

  it('App créée mais pas installée : l’étape suivante est l’installation', () => {
    render(
      <GitHubAccessPanel
        access={access({ mode: 'app', app: { ...APP, installed: false } })}
        actions={links}
        demo={false}
      />,
    );
    expect(screen.getByText(/pas encore installée/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Installer sur les dépôts' })).toHaveAttribute(
      'href',
      APP.installUrl,
    );
    expect(screen.getByRole('link', { name: 'Se connecter à GitHub' })).toBeInTheDocument();
  });

  it('connecté : le compte, l’échéance du jeton, et la déconnexion', async () => {
    const logout = vi.fn();
    render(
      <GitHubAccessPanel
        access={access({
          mode: 'app',
          app: { ...APP, installed: true },
          user: {
            login: 'cddev',
            avatarUrl: null,
            expiresAt: new Date(Date.now() + 2 * 3_600_000).toISOString(),
          },
        })}
        actions={{ ...links, logout: { onClick: logout } }}
        demo
      />,
    );
    expect(screen.getByText('cddev')).toBeInTheDocument();
    expect(screen.getByText(/prochaine échéance dans [12] h/)).toBeInTheDocument();
    expect(screen.getByText(/Démo : rien n’est envoyé à GitHub/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Se connecter à GitHub' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    expect(logout).toHaveBeenCalledOnce();
  });
});
