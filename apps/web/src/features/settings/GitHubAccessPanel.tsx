import type { GitHubAccess } from '@factory-live/contracts';
import { CheckCircleIcon, LinkExternalIcon, MarkGithubIcon } from '@primer/octicons-react';
import { Avatar, Button, Flash, Link } from '@primer/react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { LiveDot } from '../../ui/LiveDot.tsx';
import { useNow } from '../../ui/useNow.ts';
import page from '../../ui/page.module.css';
import styles from './settings.module.css';

/** Une action du parcours : une adresse du serveur (en direct) ou un pas de la démo. */
export type GitHubStep = { href: string } | { onClick: () => void };

export interface GitHubActions {
  create: GitHubStep;
  install: GitHubStep;
  login: GitHubStep;
  logout: GitHubStep;
}

function StepButton({
  step,
  primary = false,
  children,
}: {
  step: GitHubStep;
  primary?: boolean;
  children: string;
}) {
  // L'étape suivante porte le logo GitHub ; la déconnexion reste discrète.
  const visual = primary ? { leadingVisual: MarkGithubIcon } : {};
  const variant = primary ? 'primary' : 'invisible';
  return 'href' in step ? (
    <Button {...visual} as="a" href={step.href} variant={variant}>
      {children}
    </Button>
  ) : (
    <Button {...visual} variant={variant} onClick={step.onClick}>
      {children}
    </Button>
  );
}

/**
 * L'accès de factory-live à GitHub (ADR 0003) : l'App dédiée, qui lit issues, PR et CI, puis le
 * compte de Clément, au nom duquel part « /factory unblock ». Chaque état propose l'étape suivante.
 */
export function GitHubAccessPanel({
  access,
  actions,
  demo,
  error = null,
}: {
  access: GitHubAccess;
  actions: GitHubActions;
  demo: boolean;
  /** Échec de la dernière action (déconnexion). */
  error?: string | null;
}) {
  const { t, fmt } = useI18n();
  const now = useNow();
  const { app, user } = access;
  return (
    <section className={page.panel} aria-labelledby="github-title">
      <div className={styles.block}>
        <h2 id="github-title" className={page.sectionTitle}>
          {t.github.title}
        </h2>
        <p className={page.muted}>
          {t.github.intro}
          {demo ? t.github.demo : ''}
        </p>

        <dl className={styles.access}>
          <div className={styles.accessRow}>
            <dt className={styles.accessTerm}>{t.github.app}</dt>
            <dd className={styles.accessValue}>
              {!app ? (
                <>
                  <p className={styles.state}>
                    <LiveDot tone="muted" />
                    {access.mode === 'token' ? t.github.noAppToken : t.github.noApp}
                  </p>
                  <StepButton step={actions.create} primary>
                    {t.github.create}
                  </StepButton>
                  <p className={styles.help}>{t.github.createHelp}</p>
                </>
              ) : app.installed === true ? (
                <p className={styles.state}>
                  <CheckCircleIcon size={16} className={styles.ok} aria-hidden="true" />
                  <span>
                    <span className="fl-mono">{app.slug}</span>
                    {t.github.installedOn}
                    <span className={styles.nowrap}>code-my-life</span> ·{' '}
                    <Link href={app.url} target="_blank" rel="noreferrer">
                      {t.github.viewOnGitHub} <LinkExternalIcon size={12} aria-hidden="true" />
                    </Link>
                  </span>
                </p>
              ) : (
                <>
                  <p className={styles.state}>
                    <LiveDot tone="attention" />
                    <span>
                      <span className="fl-mono">{app.slug}</span>
                      {t.github.created}
                      {app.installed === false ? t.github.notInstalled : t.github.installToCheck}
                    </span>
                  </p>
                  <StepButton step={actions.install} primary>
                    {t.github.install}
                  </StepButton>
                  <p className={styles.help}>{t.github.installHelp}</p>
                </>
              )}
            </dd>
          </div>

          {app ? (
            <div className={styles.accessRow}>
              <dt className={styles.accessTerm}>{t.github.account}</dt>
              <dd className={styles.accessValue}>
                {user ? (
                  <>
                    <p className={styles.state}>
                      {user.avatarUrl ? (
                        <Avatar src={user.avatarUrl} size={20} alt="" />
                      ) : (
                        <MarkGithubIcon size={16} aria-hidden="true" />
                      )}
                      <span>
                        {t.github.signedInAs} <strong>{user.login}</strong>
                      </span>
                    </p>
                    <p className={styles.help}>
                      {t.github.tokenHelp(fmt.duration(Date.parse(user.expiresAt) - now))}
                    </p>
                    <StepButton step={actions.logout}>{t.github.logout}</StepButton>
                  </>
                ) : (
                  <>
                    <p className={styles.state}>
                      <LiveDot tone="muted" />
                      {t.github.notSignedIn}
                    </p>
                    <StepButton step={actions.login} primary>
                      {t.github.login}
                    </StepButton>
                    <p className={styles.help}>{t.github.loginHelp}</p>
                  </>
                )}
              </dd>
            </div>
          ) : null}
        </dl>
        {error ? (
          <Flash variant="danger" className={styles.flash}>
            {error}
          </Flash>
        ) : null}
      </div>
    </section>
  );
}
