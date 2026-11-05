import { Banner, Heading } from '@primer/react';
import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { MotionToggle } from '../../ui/motion.tsx';
import { useNow } from '../../ui/useNow.ts';
import { SheetGraph } from '../line/graph/FactoryGraph.tsx';
import { STUDIO_SHEET, studioProviders, videoIssue } from './model.ts';
import { useStudio } from './StudioProvider.tsx';
import { VideoDetail } from './VideoDetail.tsx';
import styles from './studio.module.css';

/**
 * The video studio: the standard graph drawn from the studio's sheet, one row per video at its
 * station, and under it the open video's detail. `/studio/:video` opens on that video.
 */
export function StudioPage() {
  const { t } = useI18n();
  const { source, items, agents, waiting } = useStudio();
  const now = useNow();
  const navigate = useNavigate();
  const { video } = useParams();
  const sheet = STUDIO_SHEET.ok ? STUDIO_SHEET.sheet : null;
  const rows = useMemo(
    () => (sheet ? items.map((item) => videoIssue(item, sheet)) : []),
    [items, sheet],
  );
  const providers = useMemo(() => studioProviders(agents), [agents]);
  const selected = video ?? null;

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <div className={styles.pageTitle}>
          <Heading as="h1" variant="medium">
            {t.studio.title}
          </Heading>
          <p className={styles.subtitle}>{t.studio.waiting(waiting.length)}</p>
        </div>
        <MotionToggle />
      </header>

      {source.kind === 'live' ? (
        <Banner variant="info" title={t.studio.title} description={t.studio.live} hideTitle />
      ) : null}

      <SheetGraph
        parsed={STUDIO_SHEET}
        items={rows}
        providers={providers}
        selectedKey={selected}
        onSelect={(key) => void navigate(key === selected ? '/studio' : `/studio/${key}`)}
        now={now}
        maxInProgress={1}
      />

      {selected && sheet ? (
        <VideoDetail key={selected} id={selected} sheet={sheet} now={now} />
      ) : (
        <p className={styles.quiet}>{t.studio.selectHint}</p>
      )}
    </div>
  );
}
