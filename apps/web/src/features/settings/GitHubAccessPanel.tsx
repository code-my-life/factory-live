import type { GitHubAccess } from '@factory-live/contracts';
import { CheckCircleIcon, LinkExternalIcon, MarkGithubIcon } from '@primer/octicons-react';
import { Avatar, Button, Link } from '@primer/react';
import { LiveDot } from '../../ui/LiveDot.tsx';
import { formatDuration } from '../../ui/format.ts';
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
}: {
  access: GitHubAccess;
  actions: GitHubActions;
  demo: boolean;
}) {
  const now = useNow();
  const { app, user } = access;
  return (
    <section className={page.panel} aria-labelledby="github-title">
      <div className={styles.block}>
        <h2 id="github-title" className={page.sectionTitle}>
          GitHub
        </h2>
        <p className={page.muted}>
          factory-live lit les issues, les PR et la CI avec sa propre App GitHub, et poste «
          /factory unblock » à ton nom quand tu débloques une carte.
          {demo ? ' Démo : rien n’est envoyé à GitHub.' : ''}
        </p>

        <dl className={styles.access}>
          <div className={styles.accessRow}>
            <dt className={styles.accessTerm}>App</dt>
            <dd className={styles.accessValue}>
              {!app ? (
                <>
                  <p className={styles.state}>
                    <LiveDot tone="muted" />
                    {access.mode === 'token'
                      ? 'Pas encore créée : factory-live lit GitHub avec le jeton de repli'
                      : 'Pas encore créée : factory-live ne lit pas encore GitHub'}
                  </p>
                  <StepButton step={actions.create} primary>
                    Créer l’App sur GitHub
                  </StepButton>
                  <p className={styles.help}>
                    GitHub la crée en un clic dans code-my-life, privée et sans webhook. Tu reviens
                    ici pour l’installer.
                  </p>
                </>
              ) : app.installed === true ? (
                <p className={styles.state}>
                  <CheckCircleIcon size={16} className={styles.ok} aria-hidden="true" />
                  <span>
                    <span className="fl-mono">{app.slug}</span>, installée sur{' '}
                    <span className={styles.nowrap}>code-my-life</span> ·{' '}
                    <Link href={app.url} target="_blank" rel="noreferrer">
                      Voir sur GitHub <LinkExternalIcon size={12} aria-hidden="true" />
                    </Link>
                  </span>
                </p>
              ) : (
                <>
                  <p className={styles.state}>
                    <LiveDot tone="attention" />
                    <span>
                      <span className="fl-mono">{app.slug}</span> créée,{' '}
                      {app.installed === false ? 'pas encore installée' : 'installation à vérifier'}
                    </span>
                  </p>
                  <StepButton step={actions.install} primary>
                    Installer sur les dépôts
                  </StepButton>
                  <p className={styles.help}>
                    Choisis « All repositories » : les prochains dépôts de la factory seront
                    couverts sans rien refaire.
                  </p>
                </>
              )}
            </dd>
          </div>

          {app ? (
            <div className={styles.accessRow}>
              <dt className={styles.accessTerm}>Ton compte</dt>
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
                        Connecté en tant que <strong>{user.login}</strong>
                      </span>
                    </p>
                    <p className={styles.help}>
                      Tes réponses partent à ton nom. Jeton renouvelé seul, prochaine échéance dans{' '}
                      {formatDuration(Date.parse(user.expiresAt) - now)}.
                    </p>
                    <StepButton step={actions.logout}>Se déconnecter</StepButton>
                  </>
                ) : (
                  <>
                    <p className={styles.state}>
                      <LiveDot tone="muted" />
                      Pas connecté : connecte-toi pour débloquer depuis l’app
                    </p>
                    <StepButton step={actions.login} primary>
                      Se connecter à GitHub
                    </StepButton>
                    <p className={styles.help}>
                      Depuis ce PC comme depuis l’iPhone : GitHub te ramène ici. Seul le compte
                      cddev est accepté.
                    </p>
                  </>
                )}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </section>
  );
}
