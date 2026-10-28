import { BellIcon, CheckCircleIcon } from '@primer/octicons-react';
import { Button, Flash } from '@primer/react';
import { useEffect, useState } from 'react';
import {
  disablePush,
  enablePush,
  pushAvailability,
  pushSubscribed,
  sendTestPush,
} from '../../pwa/push.ts';
import { LiveDot } from '../../ui/LiveDot.tsx';
import { INTERVENTION_LABEL } from '../../ui/vocabulary.ts';
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
  return (
    <>
      <h2 id="push-title" className={page.sectionTitle}>
        Notifications de cet appareil
      </h2>
      <p className={page.muted}>
        Un push part seulement quand un blocage t’attend :{' '}
        {PUSHED.map((kind) => INTERVENTION_LABEL[kind].toLowerCase()).join(', ')}. Les PR à
        approuver et la santé restent visibles ici sans notification. Telegram continue en
        parallèle.
      </p>
    </>
  );
}

function Enabled({ demo = false }: { demo?: boolean }) {
  return (
    <p className={styles.state}>
      <CheckCircleIcon size={16} className={styles.ok} aria-hidden="true" /> Activées sur cet
      appareil{demo ? ' (démo : rien n’est envoyé)' : ''}
    </p>
  );
}

function Disabled() {
  return (
    <p className={styles.state}>
      <LiveDot tone="muted" /> Pas encore activées sur cet appareil
    </p>
  );
}

/** La démo simule l'abonnement et montre à quoi ressemble une notification. */
export function DemoPushSection() {
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
  );
}

type Status = { variant: 'success' | 'danger'; text: string } | null;

/**
 * Le vrai abonnement Web Push de cet appareil : permission demandée au toucher (exigé par iOS),
 * abonnement enregistré par factory-live, test envoyé par le serveur, désabonnement.
 */
export function LivePushSection() {
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

  const run = async (action: () => Promise<void>, success: string, after: () => void) => {
    setBusy(true);
    setStatus(null);
    try {
      await action();
      after();
      setStatus({ variant: 'success', text: success });
    } catch (error) {
      setStatus({
        variant: 'danger',
        text: error instanceof Error ? error.message : String(error),
      });
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
            <LiveDot tone="attention" /> Sur iPhone et iPad, les notifications passent par l’app
            installée : dans Safari, Partager, Sur l’écran d’accueil, puis ouvre factory-live depuis
            l’écran d’accueil et reviens ici.
          </p>
        ) : availability === 'unsupported' ? (
          <p className={styles.state}>
            <LiveDot tone="muted" /> Ce navigateur ne reçoit pas de notifications Web Push.
          </p>
        ) : availability === 'denied' ? (
          <p className={styles.state}>
            <LiveDot tone="danger" /> Notifications refusées pour factory-live : réautorise-les dans
            les réglages de l’appareil, puis reviens ici.
          </p>
        ) : subscribed === null ? (
          <p className={styles.state}>
            <LiveDot tone="muted" /> Lecture de l’abonnement…
          </p>
        ) : (
          <>
            {subscribed ? <Enabled /> : <Disabled />}
            <div className={styles.actions}>
              {subscribed ? (
                <>
                  <Button
                    loading={busy}
                    onClick={() =>
                      void run(
                        sendTestPush,
                        'Test envoyé : la notification arrive dans quelques secondes.',
                        () => undefined,
                      )
                    }
                  >
                    Envoyer un test
                  </Button>
                  <Button
                    variant="invisible"
                    disabled={busy}
                    onClick={() =>
                      void run(disablePush, 'Notifications désactivées sur cet appareil.', () =>
                        setSubscribed(false),
                      )
                    }
                  >
                    Désactiver
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  leadingVisual={BellIcon}
                  loading={busy}
                  onClick={() =>
                    void run(enablePush, 'Notifications activées sur cet appareil.', () =>
                      setSubscribed(true),
                    )
                  }
                >
                  Activer les notifications
                </Button>
              )}
            </div>
          </>
        )}
        {status ? (
          <Flash variant={status.variant} className={styles.flash}>
            {status.text}
          </Flash>
        ) : null}
      </div>
    </section>
  );
}
