import {
  BellIcon,
  CheckCircleIcon,
  DeviceDesktopIcon,
  DeviceMobileIcon,
} from '@primer/octicons-react';
import { Button, Heading, SegmentedControl } from '@primer/react';
import { useState } from 'react';
import type { ColorPreference } from '../../app/colorMode.tsx';
import { useColorMode } from '../../app/colorMode.tsx';
import { useFactorySource, useSnapshot } from '../../data/FactoryProvider.tsx';
import { LiveDot } from '../../ui/LiveDot.tsx';
import { INTERVENTION_LABEL } from '../../ui/vocabulary.ts';
import page from '../../ui/page.module.css';
import styles from './settings.module.css';

const THEMES: { value: ColorPreference; label: string }[] = [
  { value: 'dark', label: 'Sombre' },
  { value: 'light', label: 'Clair' },
  { value: 'system', label: 'Système' },
];

const PUSHED = [
  'needs_input',
  'capability',
  'transient',
  'triage_loop',
  'held_active_pr',
  'gave_up',
] as const;

type PushState = 'off' | 'on';

export function SettingsPage() {
  const { preference, setPreference } = useColorMode();
  const source = useFactorySource();
  const snapshot = useSnapshot();
  const [push, setPush] = useState<PushState>('off');
  const [preview, setPreview] = useState(false);
  const sources = snapshot.health.filter((service) => service.group === 'factory-live');

  return (
    <section className={page.page} aria-labelledby="settings-title">
      <header className={page.head}>
        <Heading as="h1" variant="medium" id="settings-title">
          Réglages
        </Heading>
      </header>

      <section className={page.panel} aria-labelledby="push-title">
        <div className={styles.block}>
          <h2 id="push-title" className={page.sectionTitle}>
            Notifications de cet appareil
          </h2>
          <p className={page.muted}>
            Un push part seulement quand un blocage t’attend :{' '}
            {PUSHED.map((kind) => INTERVENTION_LABEL[kind].toLowerCase()).join(', ')}. Les PR à
            approuver et la santé restent visibles ici sans notification. Telegram continue en
            parallèle.
          </p>
          <p className={styles.state}>
            {push === 'on' ? (
              <>
                <CheckCircleIcon size={16} className={styles.ok} aria-hidden="true" /> Activées sur
                cet appareil
                {source.kind === 'demo' ? ' (démo : rien n’est envoyé)' : ''}
              </>
            ) : (
              <>
                <LiveDot tone="muted" /> Pas encore activées sur cet appareil
              </>
            )}
          </p>
          <div className={styles.actions}>
            {push === 'off' ? (
              <Button variant="primary" leadingVisual={BellIcon} onClick={() => setPush('on')}>
                Activer les notifications
              </Button>
            ) : (
              <>
                <Button onClick={() => setPreview(true)}>Envoyer un test</Button>
                <Button variant="invisible" onClick={() => setPush('off')}>
                  Désactiver
                </Button>
              </>
            )}
          </div>
          {preview && push === 'on' ? (
            <div className={styles.notification} role="status">
              <p className={styles.notificationApp}>factory-live · maintenant</p>
              <p className={styles.notificationTitle}>Décision attendue · cv-site#49</p>
              <p className={styles.notificationBody}>
                Carte UI sans maquette jointe. Touche pour répondre.
              </p>
            </div>
          ) : null}
        </div>
      </section>

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
            <li>
              <DeviceMobileIcon size={16} aria-hidden="true" />
              <span>
                <strong>iPhone</strong> : Safari sur https://desktop-gja56n4.tail40220c.ts.net:8446,
                Partager, Sur l’écran d’accueil, puis ouvre l’app et active les notifications.
              </span>
            </li>
            <li>
              <DeviceDesktopIcon size={16} aria-hidden="true" />
              <span>
                <strong>Ce PC</strong> : http://localhost:8446 dans Edge ou Chrome, puis Installer
                l’application.
              </span>
            </li>
            <li>
              <DeviceDesktopIcon size={16} aria-hidden="true" />
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
          <p className={page.muted}>
            Version 0.1.0 ·{' '}
            {source.kind === 'demo' ? 'données de démonstration' : 'données en direct'} · Hermès
            0.22.2
          </p>
        </div>
      </section>
    </section>
  );
}
