import { BellIcon, CheckCircleIcon } from '@primer/octicons-react';
import { Button, Flash } from '@primer/react';
import { useEffect, useState } from 'react';
import { describeError } from '../../data/errors.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import type { Messages } from '../../i18n/fr.ts';
import {
  disablePush,
  enablePush,
  pushAvailability,
  pushSubscribed,
  sendTestPush,
} from '../../pwa/push.ts';
import { LiveDot } from '../../ui/LiveDot.tsx';
import page from '../../ui/page.module.css';
import styles from './settings.module.css';

const PUSHED = [
  'needs_input',
  'capability',
  'transient',
  'triage_loop',
  'held_active_pr',
  'gave_up',
] as const;

function Intro() {
  const { t, locale } = useI18n();
  return (
    <>
      <h2 id="push-title" className={page.sectionTitle}>
        {t.push.title}
      </h2>
      <p className={page.muted}>
        {t.push.intro(
          PUSHED.map((kind) => t.intervention[kind].toLocaleLowerCase(locale)).join(', '),
        )}
      </p>
    </>
  );
}

function Enabled({ demo = false }: { demo?: boolean }) {
  const { t } = useI18n();
  return (
    <p className={styles.state}>
      <CheckCircleIcon size={16} className={styles.ok} aria-hidden="true" /> {t.push.enabled}
      {demo ? t.push.demoEnabled : ''}
    </p>
  );
}

function Disabled() {
  const { t } = useI18n();
  return (
    <p className={styles.state}>
      <LiveDot tone="muted" /> {t.push.disabled}
    </p>
  );
}

/** La démo simule l'abonnement et montre à quoi ressemble une notification. */
export function DemoPushSection() {
  const { t } = useI18n();
  const [push, setPush] = useState<'off' | 'on'>('off');
  const [preview, setPreview] = useState(false);
  return (
    <section className={page.panel} aria-labelledby="push-title">
      <div className={styles.block}>
        <Intro />
        {push === 'on' ? <Enabled demo /> : <Disabled />}
        <div className={styles.actions}>
          {push === 'off' ? (
            <Button variant="primary" leadingVisual={BellIcon} onClick={() => setPush('on')}>
              {t.push.enable}
            </Button>
          ) : (
            <>
              <Button onClick={() => setPreview(true)}>{t.push.test}</Button>
              <Button variant="invisible" onClick={() => setPush('off')}>
                {t.push.disable}
              </Button>
            </>
          )}
        </div>
        {preview && push === 'on' ? (
          <div className={styles.notification} role="status">
            <p className={styles.notificationApp}>{t.push.previewApp}</p>
            <p className={styles.notificationTitle}>{t.intervention.needs_input} · cv-site#49</p>
            <p className={styles.notificationBody}>
              Carte UI sans maquette jointe. {t.push.previewTap}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Ce qu'une action réussie annonce, parmi les textes de la section. */
type Done = Extract<keyof Messages['push'], 'testSent' | 'disabledDone' | 'enabledDone'>;

/** Le résultat de la dernière action, écrit à l'affichage dans la langue en cours. */
type Status = { variant: 'success'; done: Done } | { variant: 'danger'; cause: unknown } | null;

/**
 * Le vrai abonnement Web Push de cet appareil : permission demandée au toucher (exigé par iOS),
 * abonnement enregistré par factory-live, test envoyé par le serveur, désabonnement.
 */
export function LivePushSection() {
  const { t } = useI18n();
  const [availability, setAvailability] = useState(() => pushAvailability());
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    let current = true;
    pushSubscribed().then(
      (value) => current && setSubscribed(value),
      () => current && setSubscribed(false),
    );
    return () => {
      current = false;
    };
  }, []);

  const run = async (action: () => Promise<void>, done: Done, after: () => void) => {
    setBusy(true);
    setStatus(null);
    try {
      await action();
      after();
      setStatus({ variant: 'success', done });
    } catch (cause) {
      setStatus({ variant: 'danger', cause });
      setAvailability(pushAvailability());
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={page.panel} aria-labelledby="push-title">
      <div className={styles.block}>
        <Intro />
        {availability === 'install-first' ? (
          <p className={styles.state}>
            <LiveDot tone="attention" /> {t.push.installFirst}
          </p>
        ) : availability === 'unsupported' ? (
          <p className={styles.state}>
            <LiveDot tone="muted" /> {t.push.unsupported}
          </p>
        ) : availability === 'denied' ? (
          <p className={styles.state}>
            <LiveDot tone="danger" /> {t.push.denied}
          </p>
        ) : subscribed === null ? (
          <p className={styles.state}>
            <LiveDot tone="muted" /> {t.push.reading}
          </p>
        ) : (
          <>
            {subscribed ? <Enabled /> : <Disabled />}
            <div className={styles.actions}>
              {subscribed ? (
                <>
                  <Button
                    loading={busy}
                    onClick={() => void run(sendTestPush, 'testSent', () => undefined)}
                  >
                    {t.push.test}
                  </Button>
                  <Button
                    variant="invisible"
                    disabled={busy}
                    onClick={() =>
                      void run(disablePush, 'disabledDone', () => setSubscribed(false))
                    }
                  >
                    {t.push.disable}
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  leadingVisual={BellIcon}
                  loading={busy}
                  onClick={() => void run(enablePush, 'enabledDone', () => setSubscribed(true))}
                >
                  {t.push.enable}
                </Button>
              )}
            </div>
          </>
        )}
        {status ? (
          <Flash variant={status.variant} className={styles.flash}>
            {status.variant === 'success' ? t.push[status.done] : describeError(status.cause, t)}
          </Flash>
        ) : null}
      </div>
    </section>
  );
}
