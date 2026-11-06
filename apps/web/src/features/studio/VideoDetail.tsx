import type { StudioItemDetail, StudioWord, WorkflowSheet } from '@factory-live/contracts';
import { LinkExternalIcon } from '@primer/octicons-react';
import { Heading } from '@primer/react';
import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { CardBadge } from '../../ui/badge/CardBadge.tsx';
import { VideoPlayer, WordTrack, frameOf } from '../../ui/media/index.ts';
import { GestureBar } from './GestureBar.tsx';
import { pathTo } from './model.ts';
import { useStudio } from './StudioProvider.tsx';
import styles from './studio.module.css';

/** A video's detail as read from the source, for the video and the read it was made at. */
interface Read {
  id: string;
  version: number;
  detail: StudioItemDetail | null;
  words: StudioWord[];
}

/**
 * A video under the graph: its landmarks (station and since when, master, aligned words, quality
 * check, the studio's page), the owner's gesture, its journey and the steps of `vf run`, then the
 * player to the frame with the script and its aligned words.
 */
export function VideoDetail({ id, sheet, now }: { id: string; sheet: WorkflowSheet; now: number }) {
  const { t, fmt } = useI18n();
  const { source, version } = useStudio();
  const [read, setRead] = useState<Read | null>(null);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    let current = true;
    void Promise.all([source.item(id), source.words(id)]).then(([detail, words]) => {
      if (current) setRead({ id, version, detail, words });
    });
    return () => {
      current = false;
    };
  }, [source, id, version]);

  if (read?.id !== id) return <p className={styles.quiet}>{t.studio.loading}</p>;
  const { detail, words } = read;
  if (!detail) return <p className={styles.quiet}>{t.studio.unknown}</p>;

  const m = t.studio.marks;
  const names = new Map(sheet.stations.map((station) => [station.key, station.label]));
  const label = (key: string) => names.get(key) ?? key;
  const master = detail.files.find((file) => file.kind === 'video') ?? null;
  const qc = detail.steps.find((step) => step.name === 'qc');
  const last = words[words.length - 1];
  const total = last ? frameOf(last.fin) + 1 : 1;

  return (
    <article className={styles.detail} aria-labelledby={`video-${detail.id}`}>
      <header className={styles.detailHead}>
        <Heading as="h2" variant="small" id={`video-${detail.id}`}>
          {detail.title}
        </Heading>
        <dl className={styles.marks} aria-label={m.label}>
          <div className={styles.mark}>
            <dt className={styles.markLabel}>{m.station}</dt>
            <dd className={styles.markValue}>
              {label(detail.station)} · {m.since(fmt.stay(now - Date.parse(detail.since)))}
            </dd>
          </div>
          <div className={styles.mark}>
            <dt className={styles.markLabel}>{m.card}</dt>
            <dd className={styles.markValue}>
              <CardBadge id={detail.card} />
            </dd>
          </div>
          <div className={styles.mark}>
            <dt className={styles.markLabel}>{m.master}</dt>
            <dd className={styles.markValue}>{master ? master.name : m.noMaster}</dd>
          </div>
          <div className={styles.mark}>
            <dt className={styles.markLabel}>{m.words}</dt>
            <dd className={styles.markValue}>
              {words.length > 0 ? m.wordCount(words.length) : m.noWords}
            </dd>
          </div>
          {qc ? (
            <div className={styles.mark}>
              <dt className={styles.markLabel}>{m.qc}</dt>
              <dd className={styles.markValue}>{qc.result}</dd>
            </div>
          ) : null}
        </dl>
        <p className={styles.links}>
          {detail.links.studio ? (
            <a className={styles.link} href={detail.links.studio} target="_blank" rel="noreferrer">
              {m.studioPage} <LinkExternalIcon size={12} />
            </a>
          ) : null}
          {detail.links.publication ? (
            <a
              className={styles.link}
              href={detail.links.publication}
              target="_blank"
              rel="noreferrer"
            >
              {m.publication} <LinkExternalIcon size={12} />
            </a>
          ) : null}
        </p>
      </header>

      <GestureBar
        key={`${detail.station}:${detail.state}`}
        item={detail}
        sheet={sheet}
        links={detail.links}
      />

      <section className={styles.block} aria-labelledby={`journey-${detail.id}`}>
        <h3 id={`journey-${detail.id}`} className={styles.blockTitle}>
          {t.studio.journey}
        </h3>
        <ol className={styles.journey}>
          {pathTo(sheet, detail.station).map((key) => (
            <li
              key={key}
              className={styles.stop}
              aria-current={key === detail.station ? 'step' : undefined}
            >
              {label(key)}
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.block} aria-labelledby={`steps-${detail.id}`}>
        <h3 id={`steps-${detail.id}`} className={styles.blockTitle}>
          {t.studio.steps.label}
        </h3>
        {detail.steps.length === 0 ? (
          <p className={styles.quiet}>{t.studio.steps.none}</p>
        ) : (
          <ul className={styles.steps}>
            {detail.steps.map((step, index) => (
              <li key={`${index}:${step.name}`} className={styles.step} data-result={step.result}>
                <span className={styles.stepName}>{step.name}</span>
                <span className={styles.stepResult}>{step.result}</span>
                <span className={styles.stepDuration}>{fmt.stay(step.durationMs)}</span>
                {step.outputs.map((output) => (
                  <code key={output.name} className={styles.hash} title={output.sha256}>
                    {output.name} {output.sha256.slice(0, 12)}
                  </code>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.media} aria-labelledby={`script-${detail.id}`}>
        <VideoPlayer
          src={master?.url ?? null}
          total={total}
          frame={frame}
          onFrame={setFrame}
          label={t.studio.player(detail.title)}
        />
        <div className={styles.script}>
          <h3 id={`script-${detail.id}`} className={styles.blockTitle}>
            {t.studio.script.label}
          </h3>
          {words.length > 0 ? (
            <>
              {source.wordsDerived(detail.id) ? <p className={styles.quiet}>{m.derived}</p> : null}
              <WordTrack words={words} frame={frame} onSeek={setFrame} />
            </>
          ) : detail.script ? (
            <pre className={styles.scriptText}>{detail.script}</pre>
          ) : (
            <p className={styles.quiet}>{t.studio.script.none}</p>
          )}
        </div>
      </section>
    </article>
  );
}
