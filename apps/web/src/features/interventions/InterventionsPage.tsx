import type { Intervention, StudioItem } from '@factory-live/contracts';
import { ArrowLeftIcon, BellIcon, CheckCircleIcon, VideoIcon } from '@primer/octicons-react';
import { Heading } from '@primer/react';
import { Blankslate } from '@primer/react/experimental';
import { Link, useParams } from 'react-router';
import { useSnapshot } from '../../data/FactoryProvider.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Badge } from '../../ui/badge/Badge.tsx';
import { CardBadge } from '../../ui/badge/CardBadge.tsx';
import { hueOf } from '../../ui/badge/hues.ts';
import { IssueBadge } from '../../ui/badge/IssueBadge.tsx';
import { Elapsed } from '../../ui/Elapsed.tsx';
import { interventionHeadline, interventionTone } from '../../ui/work/workState.tsx';
import { GestureBar } from '../studio/GestureBar.tsx';
import { STUDIO_SHEET } from '../studio/model.ts';
import { useStudio } from '../studio/StudioProvider.tsx';
import { InterventionDetail } from './InterventionDetail.tsx';
import styles from './interventions.module.css';

const SEVERITY_ORDER: Record<Intervention['severity'], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function sortInterventions(interventions: readonly Intervention[]): Intervention[] {
  return [...interventions].sort(
    (left, right) =>
      SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
      left.openedAt.localeCompare(right.openedAt),
  );
}

/** Une ligne de la liste : la cause quand un diagnostic l'a trouvée, qui agit, et le suivi. */
function InterventionItem({
  intervention,
  current,
}: {
  intervention: Intervention;
  current: boolean;
}) {
  const { t, text } = useI18n();
  const diagnosis = intervention.diagnosis;
  return (
    <li>
      <Link
        to={`/interventions/${intervention.id}`}
        className={styles.item}
        data-tone={interventionTone(intervention)}
        data-resolved={intervention.resolvedAt ? 'true' : undefined}
        aria-current={current ? 'page' : undefined}
      >
        <span className={styles.itemKind}>
          {intervention.push ? <BellIcon size={12} aria-label={t.interventions.push} /> : null}
          {t.intervention[intervention.kind]}
        </span>
        <span className={styles.itemTitle}>{text(interventionHeadline(intervention))}</span>
        {diagnosis && !intervention.resolvedAt ? (
          <span className={styles.itemActor}>{t.diagnosis.actor[diagnosis.primary.actor]}</span>
        ) : null}
        <span className={styles.itemMeta}>
          {intervention.issueKey ? (
            <IssueBadge issueKey={intervention.issueKey} state="open" />
          ) : intervention.cardId ? (
            <CardBadge id={intervention.cardId} />
          ) : null}{' '}
          <span>
            {t.interventions.opened} <Elapsed since={intervention.openedAt} mode="age" />
          </span>
        </span>
        {intervention.unblock ? (
          <span className={styles.itemProgress}>
            {t.interventions.progress[intervention.unblock.state]}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

/** The address of a video of the studio among the interventions. */
const STUDIO_PREFIX = 'studio:';
const studioId = (video: StudioItem) => `${STUDIO_PREFIX}${video.id}`;

/** What waits for the owner: an intervention of the factory, or a video of the studio. */
type Waiting =
  { kind: 'intervention'; intervention: Intervention } | { kind: 'studio'; video: StudioItem };

/** A video that waits for the owner sorts as an open intervention to handle, opened when it arrived. */
function sortWaiting(waiting: readonly Waiting[]): Waiting[] {
  const severity = (entry: Waiting) =>
    SEVERITY_ORDER[entry.kind === 'studio' ? 'warning' : entry.intervention.severity];
  const opened = (entry: Waiting) =>
    entry.kind === 'studio' ? entry.video.since : entry.intervention.openedAt;
  return [...waiting].sort(
    (left, right) => severity(left) - severity(right) || opened(left).localeCompare(opened(right)),
  );
}

/** A video of the studio in the list: its badge « Studio », its title, its station. */
function StudioItemRow({ video, current }: { video: StudioItem; current: boolean }) {
  const { t } = useI18n();
  const station = STUDIO_SHEET.ok
    ? (STUDIO_SHEET.sheet.stations.find((candidate) => candidate.key === video.station)?.label ??
      video.station)
    : video.station;
  return (
    <li>
      <Link
        to={`/interventions/${studioId(video)}`}
        className={styles.item}
        data-tone="attention"
        data-studio=""
        aria-current={current ? 'page' : undefined}
      >
        <span className={styles.itemKind}>{t.interventions.studioWaits(station)}</span>
        <span className={styles.itemTitle}>{video.title}</span>
        <span className={styles.itemMeta}>
          <Badge
            label={t.interventions.studio}
            labelIcon={VideoIcon}
            value={video.card}
            hue={hueOf('board', 'studio')}
            code
          />{' '}
          <span>
            {t.interventions.opened} <Elapsed since={video.since} mode="age" />
          </span>
        </span>
      </Link>
    </li>
  );
}

/** A video of the studio, opened among the interventions: the same gesture as on the studio's page. */
function StudioInterventionDetail({ video }: { video: StudioItem }) {
  const { t } = useI18n();
  return (
    <article className={styles.card} aria-labelledby={`titre-${studioId(video)}`}>
      <header className={styles.cardHead}>
        <div className={styles.cardLabels}>
          <Badge
            label={t.interventions.studio}
            labelIcon={VideoIcon}
            value={video.card}
            hue={hueOf('board', 'studio')}
            code
          />
        </div>
        <Heading as="h2" variant="small" id={`titre-${studioId(video)}`}>
          {video.title}
        </Heading>
        <Link to={`/studio/${video.id}`} className={styles.studioLink}>
          {t.interventions.openStudio}
        </Link>
      </header>
      {STUDIO_SHEET.ok ? (
        <div className={styles.studioGesture}>
          <GestureBar item={video} sheet={STUDIO_SHEET.sheet} />
        </div>
      ) : null}
    </article>
  );
}

export function InterventionsPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const snapshot = useSnapshot();
  const studio = useStudio();
  const all = sortInterventions(snapshot.interventions);
  // Débloquées : encore visibles le temps de suivre la reprise, sous les interventions ouvertes.
  const interventions = sortWaiting([
    ...all
      .filter((intervention) => !intervention.resolvedAt)
      .map((intervention): Waiting => ({ kind: 'intervention', intervention })),
    ...studio.waiting.map((video): Waiting => ({ kind: 'studio', video })),
  ]);
  const recent = all
    .filter((intervention) => intervention.resolvedAt)
    .sort((left, right) => (right.resolvedAt ?? '').localeCompare(left.resolvedAt ?? ''));
  const selected = all.find((intervention) => intervention.id === id) ?? null;
  const selectedVideo = studio.waiting.find((video) => studioId(video) === id) ?? null;
  const first = interventions[0];
  const showDetailOnly = id !== undefined;

  return (
    <section
      className={styles.page}
      data-detail={showDetailOnly ? 'true' : undefined}
      aria-labelledby="interventions-title"
    >
      <header className={styles.head}>
        <Heading as="h1" variant="medium" id="interventions-title">
          {t.interventions.title}
        </Heading>
        <p className={styles.intro}>{t.interventions.intro}</p>
      </header>

      {all.length === 0 && interventions.length === 0 && !showDetailOnly ? (
        // Rien n'attend : l'état vide de Primer, à la place des deux colonnes vides.
        <Blankslate border spacious>
          <Blankslate.Visual>
            <CheckCircleIcon size="medium" className={styles.calm} />
          </Blankslate.Visual>
          <Blankslate.Heading as="h2">{t.interventions.empty}</Blankslate.Heading>
        </Blankslate>
      ) : (
        <div className={styles.layout}>
          <nav className={styles.list} aria-label={t.interventions.listLabel}>
            {interventions.length === 0 ? (
              <p className={styles.empty}>
                <CheckCircleIcon size={16} aria-hidden="true" /> {t.interventions.empty}
              </p>
            ) : (
              <ul className={styles.items}>
                {interventions.map((entry) =>
                  entry.kind === 'studio' ? (
                    <StudioItemRow
                      key={studioId(entry.video)}
                      video={entry.video}
                      current={studioId(entry.video) === id}
                    />
                  ) : (
                    <InterventionItem
                      key={entry.intervention.id}
                      intervention={entry.intervention}
                      current={entry.intervention.id === id}
                    />
                  ),
                )}
              </ul>
            )}
            {recent.length > 0 ? (
              <>
                <h2 className={styles.groupTitle}>{t.interventions.recent}</h2>
                <ul className={styles.items}>
                  {recent.map((intervention) => (
                    <InterventionItem
                      key={intervention.id}
                      intervention={intervention}
                      current={intervention.id === id}
                    />
                  ))}
                </ul>
              </>
            ) : null}
          </nav>

          <div className={styles.detail}>
            {showDetailOnly ? (
              <Link to="/interventions" className={styles.back}>
                <ArrowLeftIcon size={14} /> {t.interventions.all}
              </Link>
            ) : null}
            {selected ? (
              <InterventionDetail intervention={selected} />
            ) : selectedVideo ? (
              <StudioInterventionDetail video={selectedVideo} />
            ) : id ? (
              <Blankslate border>
                <Blankslate.Visual>
                  <CheckCircleIcon size="medium" className={styles.calm} />
                </Blankslate.Visual>
                <Blankslate.Heading as="h2">{t.interventions.resolved}</Blankslate.Heading>
              </Blankslate>
            ) : first?.kind === 'studio' ? (
              <StudioInterventionDetail video={first.video} />
            ) : first ? (
              <InterventionDetail intervention={first.intervention} />
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
