import type { StudioGestureInput, StudioItem, WorkflowSheetResult } from '@factory-live/contracts';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { STUDIO_SHEET, waitsForOwner } from './model.ts';
import type { StudioAgent } from './model.ts';
import { createLiveStudioSource, createStudioSource } from './source.ts';
import type { GestureResult, StudioSource, StudioStatus } from './source.ts';

/** What the studio's screens read: its sheet, videos and agents, read again after each gesture. */
export interface StudioState {
  source: StudioSource;
  /** False until the source has answered once. */
  ready: boolean;
  /** False when this server follows no studio: its page and tab are hidden. */
  configured: boolean;
  /** False until the studio has given a sheet. */
  sheetRead: boolean;
  /** The studio's sheet, as its source gives it: the graph is drawn from it alone. */
  sheet: WorkflowSheetResult;
  /** Since when the studio does not answer (ms), and why: the last state read stays shown. */
  unreachableSince: number | null;
  error: string | null;
  items: readonly StudioItem[];
  agents: readonly StudioAgent[];
  /** Grows at each read: a detail reads its video again. */
  version: number;
  /** The videos that wait for the owner. */
  waiting: readonly StudioItem[];
  gesture: (id: string, gesture: StudioGestureInput) => Promise<GestureResult>;
}

const waitingOf = (parsed: WorkflowSheetResult, items: readonly StudioItem[]) =>
  parsed.ok ? items.filter((item) => waitsForOwner(parsed.sheet, item)) : [];

/** The live studio is read again every so often: the server follows it every 5 s while watched. */
const LIVE_EVERY_MS = 5_000;

/** The sheet, the videos and the agents of a source, read together. */
async function readStudio(source: StudioSource) {
  const [status, items, agents] = await Promise.all([
    source.status(),
    source.items(),
    source.agents(),
  ]);
  return { status, items, agents };
}

type Read = Awaited<ReturnType<typeof readStudio>> & { version: number };

/** Outside a provider (a screen tested alone): an empty studio. */
const EMPTY_SOURCE = createLiveStudioSource();
const StudioContext = createContext<StudioState>({
  source: EMPTY_SOURCE,
  ready: true,
  configured: false,
  sheetRead: true,
  sheet: STUDIO_SHEET,
  unreachableSince: null,
  error: null,
  items: [],
  agents: [],
  version: 0,
  waiting: [],
  gesture: EMPTY_SOURCE.gesture.bind(EMPTY_SOURCE),
});

/** The studio for the screens under it: the given source, else the build's (demo, or none on live). */
export function StudioProvider({
  source: given,
  children,
}: {
  source?: StudioSource;
  children: ReactNode;
}) {
  const [source] = useState(() => given ?? createStudioSource());
  const [read, setRead] = useState<Read | null>(null);

  const reload = useCallback(
    () =>
      readStudio(source).then((value) =>
        setRead((current) => ({ ...value, version: (current?.version ?? 0) + 1 })),
      ),
    [source],
  );

  // The first read, once the source answers, then again on the live build while the page is shown;
  // a read that comes after the provider left is dropped.
  useEffect(() => {
    let current = true;
    const once = () =>
      void readStudio(source).then((value) => {
        if (current) setRead((last) => ({ ...value, version: (last?.version ?? 0) + 1 }));
      });
    once();
    const timer =
      source.kind === 'live'
        ? setInterval(() => {
            if (document.visibilityState === 'visible') once();
          }, LIVE_EVERY_MS)
        : undefined;
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [source]);

  const gesture = useCallback(
    async (id: string, input: StudioGestureInput) => {
      const result = await source.gesture(id, input);
      if (result.ok) await reload();
      return result;
    },
    [source, reload],
  );

  const value = useMemo<StudioState>(() => {
    const status: StudioStatus = read?.status ?? {
      configured: source.kind === 'demo',
      sheetRead: source.kind === 'demo',
      sheet: STUDIO_SHEET,
      unreachableSince: null,
      error: null,
    };
    return {
      source,
      ready: read !== null,
      configured: status.configured,
      sheetRead: status.sheetRead,
      sheet: status.sheet,
      unreachableSince: status.unreachableSince,
      error: status.error,
      items: read?.items ?? [],
      agents: read?.agents ?? [],
      version: read?.version ?? 0,
      waiting: waitingOf(status.sheet, read?.items ?? []),
      gesture,
    };
  }, [source, read, gesture]);
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio(): StudioState {
  return useContext(StudioContext);
}
