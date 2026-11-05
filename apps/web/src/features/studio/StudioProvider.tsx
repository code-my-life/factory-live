import type { StudioGestureInput, StudioItem } from '@factory-live/contracts';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { STUDIO_SHEET, waitsForOwner } from './model.ts';
import type { StudioAgent } from './model.ts';
import { createLiveStudioSource, createStudioSource } from './source.ts';
import type { GestureResult, StudioSource } from './source.ts';

/** What the studio's screens read: its videos and agents, read again after each gesture. */
export interface StudioState {
  source: StudioSource;
  /** False until the source has answered once. */
  ready: boolean;
  items: readonly StudioItem[];
  agents: readonly StudioAgent[];
  /** Grows at each read: a detail reads its video again. */
  version: number;
  /** The videos that wait for the owner. */
  waiting: readonly StudioItem[];
  gesture: (id: string, gesture: StudioGestureInput) => Promise<GestureResult>;
}

const sheet = STUDIO_SHEET.ok ? STUDIO_SHEET.sheet : null;

const waitingOf = (items: readonly StudioItem[]) =>
  sheet ? items.filter((item) => waitsForOwner(sheet, item)) : [];

/** The videos and the agents of a source, read together. */
async function readStudio(source: StudioSource) {
  const [items, agents] = await Promise.all([source.items(), source.agents()]);
  return { items, agents };
}

/** Outside a provider (a screen tested alone): an empty studio. */
const EMPTY_SOURCE = createLiveStudioSource();
const StudioContext = createContext<StudioState>({
  source: EMPTY_SOURCE,
  ready: true,
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
  const [read, setRead] = useState<{
    items: readonly StudioItem[];
    agents: readonly StudioAgent[];
    version: number;
  } | null>(null);

  const reload = useCallback(
    () =>
      readStudio(source).then(({ items, agents }) =>
        setRead((current) => ({ items, agents, version: (current?.version ?? 0) + 1 })),
      ),
    [source],
  );

  // The first read, once the source answers; a read that comes after the provider left is dropped.
  useEffect(() => {
    let current = true;
    void readStudio(source).then(({ items, agents }) => {
      if (current) setRead((last) => ({ items, agents, version: (last?.version ?? 0) + 1 }));
    });
    return () => {
      current = false;
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

  const value = useMemo<StudioState>(
    () => ({
      source,
      ready: read !== null,
      items: read?.items ?? [],
      agents: read?.agents ?? [],
      version: read?.version ?? 0,
      waiting: waitingOf(read?.items ?? []),
      gesture,
    }),
    [source, read, gesture],
  );
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio(): StudioState {
  return useContext(StudioContext);
}
