import type {
  AcceptanceSurface,
  AcceptanceTwin,
  AcceptanceView,
  TwinSide,
  TwinsBenchState,
} from '@factory-live/contracts';
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
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import styles from './acceptance.module.css';
import { type StreamStatus, TwinsApi, keysymOf, pointOn, watchTwin } from './neko.ts';

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

/** A dropped stream is joined again after this long. */
const RETRY_MS = 5000;
/** How often the bench's state is read while the widget is open. */
const STATE_EVERY_MS = 1000;

/** The last frame of a video, kept as an image when its stream drops; `null` if there is none. */
function frameOf(video: HTMLVideoElement): string | null {
  if (!video.videoWidth) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.8);
  } catch {
    return null;
  }
}

/**
 * A twin's screen, live (#23): its Neko stream, its last image until the stream plays, and the owner's
 * gestures sent to the bench in the twin's own pixels, the pointer at most once a frame.
 */
function LiveScreen({ api, side, name }: { api: TwinsApi; side: TwinSide; name: string }) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const [kept, setKept] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const moving = useRef<{ x: number; y: number } | null>(null);
  const frame = useRef(0);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let leave = () => {};
    let gone = false;
    const onStatus = (next: StreamStatus) => {
      if (gone) return;
      if (next === 'lost') setKept((previous) => frameOf(element) ?? previous);
      if (next === 'live') setKept(null);
      setStatus(next);
    };
    api
      .session(side)
      .then((session) => {
        if (!gone) leave = watchTwin(session, element, onStatus);
      })
      .catch(() => onStatus('lost'));
    return () => {
      gone = true;
      leave();
    };
  }, [api, side, attempt]);

  // A failed retry stays « lost »: each attempt schedules the next one.
  useEffect(() => {
    if (status !== 'lost') return;
    const retry = setTimeout(() => setAttempt((count) => count + 1), RETRY_MS);
    return () => clearTimeout(retry);
  }, [status, attempt]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // What the owner holds down on the twin: released on every way out, so nothing stays pressed there.
  const held = useRef({ buttons: new Set<number>(), keys: new Set<number>() });
  const releaseAll = useCallback(() => {
    for (const code of held.current.buttons)
      api.gesture({ side, event: 'control/buttonup', payload: { code } });
    for (const keysym of held.current.keys)
      api.gesture({ side, event: 'control/keyup', payload: { keysym } });
    held.current.buttons.clear();
    held.current.keys.clear();
  }, [api, side]);
  useEffect(() => {
    if (status !== 'live') releaseAll();
  }, [status, releaseAll]);
  useEffect(() => releaseAll, [releaseAll]);

  const at = (event: { clientX: number; clientY: number }) =>
    video.current ? pointOn(video.current, event.clientX, event.clientY) : null;
  const move = (point: { x: number; y: number }) =>
    api.gesture({ side, event: 'control/move', payload: point });

  const onPointerMove = (event: PointerEvent) => {
    const point = at(event);
    if (!point || status !== 'live') return;
    // The pointer goes once a frame: the latest place, never a queue of old ones.
    if (!moving.current) {
      frame.current = requestAnimationFrame(() => {
        if (moving.current) move(moving.current);
        moving.current = null;
      });
    }
    moving.current = point;
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const point = at(event);
    if (!point || status !== 'live') return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    move(point);
    held.current.buttons.add(event.button + 1);
    api.gesture({ side, event: 'control/buttondown', payload: { code: event.button + 1 } });
  };
  // A release always goes, live or not, as long as its press went.
  const onPointerUp = (event: PointerEvent) => {
    const code = event.button + 1;
    if (!held.current.buttons.delete(code)) return;
    api.gesture({ side, event: 'control/buttonup', payload: { code } });
  };
  const onKey = (event: KeyboardEvent) => {
    const keysym = keysymOf(event.key);
    if (!keysym) return;
    if (event.type === 'keydown') {
      if (status !== 'live') return;
      held.current.keys.add(keysym);
    } else if (!held.current.keys.delete(keysym)) return;
    event.preventDefault();
    api.gesture({
      side,
      event: event.type === 'keydown' ? 'control/keydown' : 'control/keyup',
      payload: { keysym },
    });
  };

  // The wheel scrolls the twin, not the page: a listener that may cancel it (React's is passive).
  const screenRef = useRef<HTMLDivElement>(null);
  const live = useRef(false);
  useEffect(() => {
    live.current = status === 'live';
  }, [status]);
  useEffect(() => {
    const element = screenRef.current;
    if (!element) return;
    const onWheel = (event: globalThis.WheelEvent) => {
      if (!live.current) return;
      event.preventDefault();
      const step = (delta: number) =>
        Math.max(-10, Math.min(10, Math.round(delta / 40))) || Math.sign(delta);
      api.gesture({
        side,
        event: 'control/scroll',
        payload: { delta_x: step(event.deltaX), delta_y: step(event.deltaY) },
      });
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [api, side]);

  const still = kept ?? api.shot(side);
  return (
    <div
      ref={screenRef}
      className={styles.live}
      data-status={status}
      role="application"
      aria-label={name}
      aria-roledescription={t.acceptance.twins.liveScreen}
      tabIndex={0}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={releaseAll}
      onBlur={releaseAll}
      onKeyDown={onKey}
      onKeyUp={onKey}
      onContextMenu={(event) => event.preventDefault()}
    >
      <video ref={video} className={styles.liveVideo} autoPlay muted playsInline />
      {status === 'live' ? null : (
        <>
          <img src={still} alt="" className={styles.liveStill} />
          <p className={styles.liveStatus} role="status">
            {status === 'lost' ? t.acceptance.twins.lost : t.acceptance.twins.connecting}
          </p>
        </>
      )}
    </div>
  );
}

/** The bench's mirror, read every second while the widget shows a live pair. */
function useBenchState(api: TwinsApi | null): TwinsBenchState | null {
  const [state, setState] = useState<TwinsBenchState | null>(null);
  useEffect(() => {
    if (!api) return;
    let gone = false;
    const read = () =>
      api
        .state()
        .then((next) => {
          if (!gone) setState(next);
        })
        .catch(() => undefined);
    void read();
    const every = setInterval(read, STATE_EVERY_MS);
    return () => {
      gone = true;
      clearInterval(every);
    };
  }, [api]);
  return state;
}

/**
 * The app before and after the PR, both alive in the factory's twin bench, surface by surface: the
 * reviewer uses either one, the bench replays the gesture on the other and marks what differs. When a
 * gesture has no counterpart, the mirror waits: drive each twin separately, or start both again.
 */
export function TwinsWidget({
  view,
  fetchImpl,
}: {
  view: AcceptanceView;
  /** The server's side of the bench (tests); the browser's `fetch` otherwise. */
  fetchImpl?: typeof fetch;
}) {
  const { t } = useI18n();
  const narrow = useNarrow();
  const mirrorId = useId();
  const twins = view.twins;
  const [surfaceId, setSurfaceId] = useState<string | null>(null);
  const [chosen, setChosen] = useState<View | null>(null);
  const [mirror, setMirror] = useState(true);
  const [split, setSplit] = useState(50);
  const [diverged, setDiverged] = useState(true);
  const live = view.twins?.surfaces.find((each) => each.head.stream ?? each.base.stream);
  const streamOf = live ? (live.head.stream ?? live.base.stream) : null;
  const api = useMemo(() => TwinsApi.of(streamOf, fetchImpl), [streamOf, fetchImpl]);
  const bench = useBenchState(api);

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
  // Live, the bench says whether the mirror is on and what it waits on; in the demo, this screen does.
  const mirrorOn = api ? (bench?.mirror ?? true) : mirror;
  const divergence = api ? (bench?.divergence ?? null) : twins.divergence;
  const waiting = api ? divergence : mirror && diverged && twins.divergence;
  const setMirrorOn = (on: boolean) => {
    if (api) void api.mirror(on);
    else setMirror(on);
  };
  const resync = () => {
    if (api) void api.resync();
    else {
      setDiverged(false);
      setMirror(true);
    }
  };

  return (
    <div className={styles.twins}>
      <p className={styles.twinsNote}>
        {t.acceptance.twins.state[twins.state]}.{' '}
        {api
          ? bench?.lagMs != null
            ? t.acceptance.twins.lag(bench.lagMs)
            : ''
          : t.acceptance.twins.preview}
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
            checked={mirrorOn}
            onChange={setMirrorOn}
            statusLabelPosition="end"
          />
        </span>
      </div>

      <p className={styles.twinsNote}>
        {mirrorOn ? t.acceptance.twins.mirrorOn : t.acceptance.twins.mirrorOff}
        {surface.differences !== null
          ? ` ${t.acceptance.twins.differences(surface.differences)}.`
          : ''}
      </p>

      {waiting ? (
        <div className={styles.divergence}>
          <Banner
            variant="warning"
            title={t.acceptance.twins.divergence}
            description={divergence ?? ''}
          />
          {/* The two ways out sit under the message: on a phone, a banner's own actions overflow. */}
          <div className={styles.divergenceActions}>
            <Button onClick={() => setMirrorOn(false)}>{t.acceptance.twins.drive}</Button>
            <Button leadingVisual={SyncIcon} onClick={resync}>
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
              {api && surface[side].stream ? (
                <LiveScreen api={api} side={side} name={names[side]} />
              ) : (
                <Screen twin={surface[side]} name={names[side]} />
              )}
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

      {!mirrorOn ? (
        <Button size="small" leadingVisual={SyncIcon} onClick={resync}>
          {t.acceptance.twins.resync}
        </Button>
      ) : null}
    </div>
  );
}
