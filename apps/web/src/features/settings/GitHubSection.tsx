import type { GitHubAccess } from '@factory-live/contracts';
import { useState } from 'react';
import { describeError } from '../../data/errors.ts';
import { useFactorySource, useGitHubAccess } from '../../data/FactoryProvider.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { LiveDot } from '../../ui/LiveDot.tsx';
import page from '../../ui/page.module.css';
import { GitHubAccessPanel } from './GitHubAccessPanel.tsx';
import styles from './settings.module.css';

const APP_SLUG = 'factory-live-code-my-life';
const APP_URL = `https://github.com/apps/${APP_SLUG}`;

/** Le parcours GitHub de la démo, une étape par clic : rien, App créée, App installée, Clément connecté. */
function demoGitHubAccess(step: number, connectedAt: number): GitHubAccess {
  const app =
    step >= 1
      ? {
          slug: APP_SLUG,
          url: APP_URL,
          installed: step >= 2,
          installUrl: `${APP_URL}/installations/new`,
        }
      : null;
  return {
    mode: app ? 'app' : 'none',
    app,
    user:
      step >= 3
        ? {
            login: 'cddev',
            avatarUrl: null,
            expiresAt: new Date(connectedAt + 8 * 3_600_000).toISOString(),
          }
        : null,
    setupUrl: '/api/github/setup',
    loginUrl: '/api/github/login',
  };
}

export function DemoGitHubSection() {
  const [step, setStep] = useState(0);
  const [connectedAt, setConnectedAt] = useState(0);
  return (
    <GitHubAccessPanel
      access={demoGitHubAccess(step, connectedAt)}
      demo
      actions={{
        create: { onClick: () => setStep(1) },
        install: { onClick: () => setStep(2) },
        login: {
          onClick: () => {
            setConnectedAt(Date.now());
            setStep(3);
          },
        },
        logout: { onClick: () => setStep(2) },
      }}
    />
  );
}

/**
 * L'accès réel : l'état vient du serveur (`/api/github/status`) ; créer l'App, l'installer et se
 * connecter mènent aux pages du serveur puis à GitHub, qui ramène ici ; la déconnexion est une écriture.
 */
export function LiveGitHubSection() {
  const { t } = useI18n();
  const source = useFactorySource();
  const access = useGitHubAccess();
  const [error, setError] = useState<{ cause: unknown } | null>(null);
  if (!access) {
    return (
      <section className={page.panel} aria-labelledby="github-title">
        <div className={styles.block}>
          <h2 id="github-title" className={page.sectionTitle}>
            {t.github.title}
          </h2>
          <p className={styles.state}>
            <LiveDot tone="muted" /> {t.github.reading}
          </p>
        </div>
      </section>
    );
  }
  return (
    <GitHubAccessPanel
      access={access}
      demo={false}
      error={error ? describeError(error.cause, t) : null}
      actions={{
        create: { href: access.setupUrl },
        install: { href: access.app?.installUrl ?? access.setupUrl },
        login: { href: access.loginUrl },
        logout: {
          onClick: () => {
            setError(null);
            source.logoutGitHub?.().catch((cause: unknown) => setError({ cause }));
          },
        },
      }}
    />
  );
}
