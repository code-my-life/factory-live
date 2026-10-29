import { DeviceDesktopIcon, DeviceMobileIcon } from '@primer/octicons-react';
import { Flash, Heading, SegmentedControl } from '@primer/react';
import { useSearchParams } from 'react-router';
import type { ColorPreference } from '../../app/colorMode.tsx';
import { useColorMode } from '../../app/colorMode.tsx';
import { useFactorySource, useSnapshot } from '../../data/FactoryProvider.tsx';
import { VersionBadge } from '../../ui/badge/VersionBadge.tsx';
import { LiveDot } from '../../ui/LiveDot.tsx';
import page from '../../ui/page.module.css';
import { DemoGitHubSection, LiveGitHubSection } from './GitHubSection.tsx';
import { DemoPushSection, LivePushSection } from './PushSection.tsx';
import styles from './settings.module.css';

const THEMES: { value: ColorPreference; label: string }[] = [
  { value: 'dark', label: 'Sombre' },
  { value: 'light', label: 'Clair' },
  { value: 'system', label: 'Système' },
];

/** Retours de GitHub après une étape faite chez lui (`/api/github/installed`, `/api/github/oauth/callback`). */
const GITHUB_RETURN: Record<string, string> = {
  installed: 'App GitHub installée : factory-live lit désormais tes dépôts avec elle.',
  connected: 'Connecté à GitHub : tes réponses partiront à ton nom.',
};

export function SettingsPage() {
  const { preference, setPreference } = useColorMode();
  const source = useFactorySource();
  const snapshot = useSnapshot();
  const [params] = useSearchParams();
  const githubReturn = GITHUB_RETURN[params.get('github') ?? ''];
  const sources = snapshot.health.filter((service) => service.group === 'factory-live');
  const demo = source.kind === 'demo';

  return (
    <section className={page.page} aria-labelledby="settings-title">
      <header className={page.head}>
        <Heading as="h1" variant="medium" id="settings-title">
          Réglages
        </Heading>
      </header>

      {githubReturn ? (
        <Flash variant="success" className={styles.flash}>
          {githubReturn}
        </Flash>
      ) : null}

      {demo ? <DemoPushSection /> : <LivePushSection />}

      {demo ? <DemoGitHubSection /> : <LiveGitHubSection />}

      <section className={page.panel} aria-labelledby="theme-title">
        <div className={styles.block}>
          <h2 id="theme-title" className={page.sectionTitle}>
            Thème
          </h2>
          <SegmentedControl
            aria-label="Thème"
            onChange={(index) => setPreference(THEMES[index ?? 0]?.value ?? 'dark')}
          >
            {THEMES.map((theme) => (
              <SegmentedControl.Button key={theme.value} selected={theme.value === preference}>
                {theme.label}
              </SegmentedControl.Button>
            ))}
          </SegmentedControl>
        </div>
      </section>

      <section className={page.panel} aria-labelledby="install-title">
        <div className={styles.block}>
          <h2 id="install-title" className={page.sectionTitle}>
            Installer l’app
          </h2>
          <ul className={styles.install}>
            <li className={styles.installItem}>
              <DeviceMobileIcon size={16} aria-hidden="true" className={styles.installIcon} />
              <span>
                <strong>iPhone</strong> : Safari sur https://desktop-gja56n4.tail40220c.ts.net:8446,
                Partager, Sur l’écran d’accueil, puis ouvre l’app et active les notifications.
              </span>
            </li>
            <li className={styles.installItem}>
              <DeviceDesktopIcon size={16} aria-hidden="true" className={styles.installIcon} />
              <span>
                <strong>Ce PC</strong> : http://localhost:8446 dans Edge ou Chrome, puis Installer
                l’application.
              </span>
            </li>
            <li className={styles.installItem}>
              <DeviceDesktopIcon size={16} aria-hidden="true" className={styles.installIcon} />
              <span>
                <strong>Mac ou autre PC du tailnet</strong> : la même adresse que l’iPhone, dans
                Chrome, Edge ou Safari.
              </span>
            </li>
          </ul>
        </div>
      </section>

      <section className={page.panel} aria-labelledby="sources-title">
        <div className={styles.block}>
          <h2 id="sources-title" className={page.sectionTitle}>
            Sources
          </h2>
          <ul className={styles.sources}>
            {sources.map((service) => (
              <li key={service.id}>
                <LiveDot tone={service.status === 'ok' ? 'success' : 'attention'} />{' '}
                <strong>{service.label}</strong> : {service.detail}
              </li>
            ))}
          </ul>
          <p className={styles.versions}>
            <VersionBadge of="factory-live" version="0.1.0" />
            <VersionBadge of="Hermès" version="0.22.2" />
            <span className={page.muted}>
              {demo ? 'données de démonstration' : 'données en direct'}
            </span>
          </p>
        </div>
      </section>
    </section>
  );
}
