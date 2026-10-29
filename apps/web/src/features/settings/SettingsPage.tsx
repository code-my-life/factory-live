import { DeviceDesktopIcon, DeviceMobileIcon } from '@primer/octicons-react';
import { Flash, Heading, SegmentedControl } from '@primer/react';
import { useSearchParams } from 'react-router';
import type { ColorPreference } from '../../app/colorMode.tsx';
import { useColorMode } from '../../app/colorMode.tsx';
import { useFactorySource, useSnapshot } from '../../data/FactoryProvider.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import type { Messages } from '../../i18n/fr.ts';
import type { Locale } from '../../i18n/locale.ts';
import { VersionBadge } from '../../ui/badge/VersionBadge.tsx';
import { LiveDot } from '../../ui/LiveDot.tsx';
import page from '../../ui/page.module.css';
import { DemoGitHubSection, LiveGitHubSection } from './GitHubSection.tsx';
import { DemoPushSection, LivePushSection } from './PushSection.tsx';
import styles from './settings.module.css';

const THEMES: readonly ColorPreference[] = ['dark', 'light', 'system'];

/**
 * Chaque langue s'écrit dans sa propre langue, pour qu'on la reconnaisse quelle que soit celle de
 * l'interface ; `lang` la fait lire correctement par les lecteurs d'écran.
 */
const LANGUAGES: readonly { value: Locale; label: string }[] = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
];

/** factory-live est une PWA : elle s'installe depuis le navigateur de chaque appareil, sans store. */
const INSTALL = [
  { device: 'computer', icon: DeviceDesktopIcon },
  { device: 'android', icon: DeviceMobileIcon },
  { device: 'ios', icon: DeviceMobileIcon },
] as const;

/** Retours de GitHub après une étape faite chez lui (`/api/github/installed`, `/api/github/oauth/callback`). */
function githubReturn(value: string | null, t: Messages): string | null {
  return value === 'installed' || value === 'connected' ? t.settings.githubReturn[value] : null;
}

export function SettingsPage() {
  const { t, locale, setLocale, text } = useI18n();
  const { preference, setPreference } = useColorMode();
  const source = useFactorySource();
  const snapshot = useSnapshot();
  const [params] = useSearchParams();
  const returned = githubReturn(params.get('github'), t);
  const sources = snapshot.health.filter((service) => service.group === 'factory-live');
  const demo = source.kind === 'demo';

  return (
    <section className={page.page} aria-labelledby="settings-title">
      <header className={page.head}>
        <Heading as="h1" variant="medium" id="settings-title">
          {t.settings.title}
        </Heading>
      </header>

      {returned ? (
        <Flash variant="success" className={styles.flash}>
          {returned}
        </Flash>
      ) : null}

      {demo ? <DemoPushSection /> : <LivePushSection />}

      {demo ? <DemoGitHubSection /> : <LiveGitHubSection />}

      <section className={page.panel} aria-labelledby="theme-title">
        <div className={styles.block}>
          <h2 id="theme-title" className={page.sectionTitle}>
            {t.settings.theme}
          </h2>
          <SegmentedControl
            aria-label={t.settings.theme}
            onChange={(index) => setPreference(THEMES[index ?? 0] ?? 'dark')}
          >
            {THEMES.map((theme) => (
              <SegmentedControl.Button key={theme} selected={theme === preference}>
                {t.settings.themes[theme]}
              </SegmentedControl.Button>
            ))}
          </SegmentedControl>
        </div>
      </section>

      <section className={page.panel} aria-labelledby="language-title">
        <div className={styles.block}>
          <h2 id="language-title" className={page.sectionTitle}>
            {t.settings.language}
          </h2>
          <SegmentedControl
            aria-label={t.settings.language}
            onChange={(index) => setLocale(LANGUAGES[index ?? 0]?.value ?? locale)}
          >
            {LANGUAGES.map((language) => (
              <SegmentedControl.Button
                key={language.value}
                lang={language.value}
                selected={language.value === locale}
              >
                {language.label}
              </SegmentedControl.Button>
            ))}
          </SegmentedControl>
        </div>
      </section>

      <section className={page.panel} aria-labelledby="install-title">
        <div className={styles.block}>
          <h2 id="install-title" className={page.sectionTitle}>
            {t.settings.install}
          </h2>
          <p className={page.muted}>{t.settings.installIntro}</p>
          <p className={styles.installOpen}>
            {/* Adresses données par le serveur (sa configuration) ; la démo montre un exemple. */}
            {snapshot.addresses.tailnet
              ? t.settings.installOpen(snapshot.addresses.local, snapshot.addresses.tailnet)
              : t.settings.installOpenLocal(snapshot.addresses.local)}
          </p>
          <ul className={styles.install}>
            {INSTALL.map(({ device, icon: DeviceIcon }) => (
              <li key={device} className={styles.installItem}>
                <DeviceIcon size={16} aria-hidden="true" className={styles.installIcon} />
                <span>
                  <strong>{t.settings.installSteps[device].device}</strong>
                  {t.settings.installSteps[device].text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={page.panel} aria-labelledby="sources-title">
        <div className={styles.block}>
          <h2 id="sources-title" className={page.sectionTitle}>
            {t.settings.sources}
          </h2>
          <ul className={styles.sources}>
            {sources.map((service) => (
              <li key={service.id}>
                <LiveDot tone={service.status === 'ok' ? 'success' : 'attention'} />{' '}
                <strong>{text(service.label)}</strong>
                {t.common.colon}
                {text(service.detail)}
              </li>
            ))}
          </ul>
          <p className={styles.versions}>
            <VersionBadge of="factory-live" version="0.1.0" />
            <VersionBadge of="Hermès" version="0.22.2" />
            <span className={page.muted}>{t.settings.dataSource(demo)}</span>
          </p>
        </div>
      </section>
    </section>
  );
}
