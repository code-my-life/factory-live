import type { AcceptanceSurface, AcceptanceTwin, AcceptanceView } from '@factory-live/contracts';
import {
  BookIcon,
  BrowserIcon,
  DeviceDesktopIcon,
  GlobeIcon,
  ServerIcon,
  SyncIcon,
  TerminalIcon,
} from '@primer/octicons-react';
import { Banner, Button, SegmentedControl, ToggleSwitch } from '@primer/react';
import { useId, useState, useSyncExternalStore } from 'react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import styles from './acceptance.module.css';

type View = 'side' | 'overlay' | 'base' | 'head';

const KIND_ICON = {
  web: BrowserIcon,
  desktop: DeviceDesktopIcon,
  terminal: TerminalIcon,
  api: ServerIcon,
  site: GlobeIcon,
  docs: BookIcon,
} as const;

/** Below this width the twins take turns: one at a time, or overlaid. */
const NARROW = '(max-width: 767px)';

function subscribe(listener: () => void): () => void {
  const query = window.matchMedia(NARROW);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

function useNarrow(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
}

/**
 * A twin's screen. In the factory, the Neko stream of its container; until it connects, and in the
 * demo, a still of that screen.
 */
function Screen({ twin, name }: { twin: AcceptanceTwin; name: string }) {
  const { t } = useI18n();
  return twin.poster ? (
    <img src={twin.poster} alt={name} className={styles.screenImage} />
  ) : (
    <p className={styles.screenEmpty}>{t.acceptance.twins.noStill}</p>
  );
}

/**
 * The app before and after the PR, both alive in the factory's twin bench, surface by surface: the
 * reviewer uses either one, the bench replays the gesture on the other and marks what differs. When a
 * gesture has no counterpart, the mirror waits: drive each twin separately, or start both again.
 */
export function TwinsWidget({ view }: { view: AcceptanceView }) {
  const { t } = useI18n();
  const narrow = useNarrow();
  const mirrorId = useId();
  const twins = view.twins;
  const [surfaceId, setSurfaceId] = useState<string | null>(null);
  const [chosen, setChosen] = useState<View | null>(null);
  const [mirror, setMirror] = useState(true);
  const [split, setSplit] = useState(50);
  const [diverged, setDiverged] = useState(true);

  if (!twins) {
    return (
      <p className={styles.empty}>{t.acceptance.twins.absent[view.twinsAbsent ?? 'no_build']}</p>
    );
  }

  const surfaces = twins.surfaces;
  const surface: AcceptanceSurface =
    surfaces.find((each) => each.id === surfaceId) ??
    surfaces.find((each) => each.changed) ??
    (surfaces[0] as AcceptanceSurface);
  const views: View[] = narrow ? ['base', 'head', 'overlay'] : ['side', 'overlay'];
  const current: View = chosen && views.includes(chosen) ? chosen : (views[0] ?? 'side');
  const viewLabel: Record<View, string> = {
    side: t.acceptance.twins.side,
    overlay: t.acceptance.twins.overlay,
    base: t.acceptance.twins.base,
    head: t.acceptance.twins.head,
  };
  const names = {
    base: t.acceptance.twins.screen(t.acceptance.twins.base, surface.base.sha),
    head: t.acceptance.twins.screen(t.acceptance.twins.head, surface.head.sha),
  };
  const waiting = mirror && diverged && twins.divergence;

  return (
    <div className={styles.twins}>
      <p className={styles.twinsNote}>
        {t.acceptance.twins.state[twins.state]}. {t.acceptance.twins.preview}
      </p>

      <div className={styles.twinsTools}>
        <SegmentedControl
          aria-label={t.acceptance.twins.surfaces}
          size="small"
          onChange={(index) => setSurfaceId(surfaces[index]?.id ?? null)}
        >
          {surfaces.map((each) => (
            <SegmentedControl.Button
              key={each.id}
              leadingVisual={KIND_ICON[each.kind]}
              selected={each.id === surface.id}
              aria-label={each.changed ? each.label : t.acceptance.twins.unchanged(each.label)}
            >
              {each.label}
            </SegmentedControl.Button>
          ))}
        </SegmentedControl>
        <SegmentedControl
          aria-label={t.acceptance.twins.view}
          size="small"
          onChange={(index) => setChosen(views[index] ?? null)}
        >
          {views.map((each) => (
            <SegmentedControl.Button key={each} selected={each === current}>
              {viewLabel[each]}
            </SegmentedControl.Button>
          ))}
        </SegmentedControl>
        <span className={styles.mirror}>
          <span id={mirrorId} className={styles.mirrorLabel}>
            {t.acceptance.twins.mirror}
          </span>
          <ToggleSwitch
            aria-labelledby={mirrorId}
            size="small"
            checked={mirror}
            onChange={setMirror}
            statusLabelPosition="end"
          />
        </span>
      </div>

      <p className={styles.twinsNote}>
        {mirror ? t.acceptance.twins.mirrorOn : t.acceptance.twins.mirrorOff}
        {surface.differences !== null
          ? ` ${t.acceptance.twins.differences(surface.differences)}.`
          : ''}
      </p>

      {waiting ? (
        <div className={styles.divergence}>
          <Banner
            variant="warning"
            title={t.acceptance.twins.divergence}
            description={twins.divergence}
          />
          {/* The two ways out sit under the message: on a phone, a banner's own actions overflow. */}
          <div className={styles.divergenceActions}>
            <Button onClick={() => setMirror(false)}>{t.acceptance.twins.drive}</Button>
            <Button leadingVisual={SyncIcon} onClick={() => setDiverged(false)}>
              {t.acceptance.twins.resync}
            </Button>
          </div>
        </div>
      ) : null}

      <div className={styles.stage} data-view={current}>
        {(['base', 'head'] as const).map((side) => (
          <figure
            key={side}
            className={styles.pane}
            data-side={side}
            data-hidden={
              (current === 'base' && side === 'head') || (current === 'head' && side === 'base')
                ? ''
                : undefined
            }
            style={
              current === 'overlay' && side === 'head'
                ? { clipPath: `inset(0 0 0 ${split}%)` }
                : undefined
            }
          >
            <figcaption
              className={styles.paneHead}
              data-end={current === 'overlay' && side === 'head' ? '' : undefined}
            >
              <span className={styles.paneName}>
                {side === 'base' ? t.acceptance.twins.base : t.acceptance.twins.head}
              </span>
              <span className={styles.paneSha}>
                {side === 'base'
                  ? t.acceptance.twins.baseOf(surface.base.sha)
                  : t.acceptance.twins.headOf(surface.head.sha)}
              </span>
            </figcaption>
            <div className={styles.screen}>
              <Screen twin={surface[side]} name={names[side]} />
            </div>
          </figure>
        ))}
        {current === 'overlay' ? (
          <span
            className={styles.splitLine}
            style={{ insetInlineStart: `${split}%` }}
            aria-hidden="true"
          />
        ) : null}
      </div>

      {current === 'overlay' ? (
        <input
          type="range"
          min={0}
          max={100}
          value={split}
          onChange={(event) => setSplit(Number(event.target.value))}
          aria-label={t.acceptance.twins.split}
          className={styles.split}
        />
      ) : null}

      {!mirror ? (
        <Button size="small" leadingVisual={SyncIcon} onClick={() => setMirror(true)}>
          {t.acceptance.twins.resync}
        </Button>
      ) : null}
    </div>
  );
}
