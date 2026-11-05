import type { StudioItem, StudioLinks, WorkflowSheet } from '@factory-live/contracts';
import { LinkExternalIcon } from '@primer/octicons-react';
import { Button, FormControl, Textarea } from '@primer/react';
import { useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { returnOf, waitsForOwner } from './model.ts';
import { useStudio } from './StudioProvider.tsx';
import styles from './studio.module.css';

/**
 * The owner's gesture on a video, the same on the studio's page and among the interventions: at a
 * station that waits for them, « Valider », and « Refaire… » with its reason where the station has a
 * return; at Tournage, the takes' page; a failed lane, « Relancer ».
 */
export function GestureBar({
  item,
  sheet,
  links,
}: {
  item: StudioItem;
  sheet: WorkflowSheet;
  links?: StudioLinks | undefined;
}) {
  const { t } = useI18n();
  const { gesture } = useStudio();
  const [redo, setRedo] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);
  const waits = waitsForOwner(sheet, item);
  const back = returnOf(sheet, item.station);
  const failed = item.state === 'failed';
  const g = t.studio.gesture;

  const send = async (decision: 'ok' | 'refaire') => {
    setBusy(true);
    setRefused(false);
    const result = await gesture(item.id, decision === 'ok' ? { decision } : { decision, note });
    setBusy(false);
    setRefused(!result.ok);
  };

  return (
    <section className={styles.gesture} aria-label={g.label} data-state={item.state}>
      {failed ? (
        <p className={styles.failure}>
          <strong>{g.failed}</strong> {item.failure}
        </p>
      ) : waits && item.waits ? (
        <p className={styles.waits}>{item.waits}</p>
      ) : null}
      {waits || failed ? (
        <div className={styles.actions}>
          <Button variant="primary" disabled={busy} onClick={() => void send('ok')}>
            {failed ? g.relaunch : g.approve}
          </Button>
          {waits && back !== undefined ? (
            <Button aria-expanded={redo} disabled={busy} onClick={() => setRedo((open) => !open)}>
              {g.redo}
            </Button>
          ) : null}
          {waits && links?.takes ? (
            <Button
              as="a"
              href={links.takes}
              target="_blank"
              rel="noreferrer"
              trailingVisual={LinkExternalIcon}
            >
              {g.takes}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className={styles.quiet}>{g.none}</p>
      )}
      {redo && waits ? (
        <div className={styles.reason}>
          <FormControl>
            <FormControl.Label>{g.reason}</FormControl.Label>
            <Textarea
              block
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <FormControl.Caption>{g.reasonHint}</FormControl.Caption>
          </FormControl>
          <div className={styles.actions}>
            <Button
              variant="primary"
              disabled={busy || note.trim() === ''}
              onClick={() => void send('refaire')}
            >
              {g.send}
            </Button>
            <Button variant="invisible" onClick={() => setRedo(false)}>
              {g.cancel}
            </Button>
          </div>
        </div>
      ) : null}
      {refused ? (
        <p className={styles.refused} role="alert">
          {g.refused}
        </p>
      ) : null}
    </section>
  );
}
