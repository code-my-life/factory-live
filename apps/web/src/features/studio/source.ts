import { StudioGesture, StudioItem } from '@factory-live/contracts';
import type {
  StudioGestureInput,
  StudioItemDetail,
  StudioWord,
  WorkflowSheet,
} from '@factory-live/contracts';
import { DEMO_AGENTS, DEMO_VIDEOS, DEMO_WORDS } from '../../demo/studio.ts';
import { STUDIO_SHEET, kindAt, nextStation, returnOf } from './model.ts';
import type { StudioAgent } from './model.ts';

/** The answer to a gesture: done, or refused with why (the state stays as it was). */
export type GestureResult = { ok: true } | { ok: false; error: string };

/**
 * Where the studio's page reads the studio: its videos, a video's detail and aligned words, its
 * agents, and the owner's gesture. The demo is its only implementation for now; the live studio
 * (`vf studio serve`) comes with the next piece (#31). `live` is the build that waits for it: no video.
 */
export interface StudioSource {
  readonly kind: 'demo' | 'live';
  items(): Promise<StudioItem[]>;
  item(id: string): Promise<StudioItemDetail | null>;
  words(id: string): Promise<StudioWord[]>;
  agents(): Promise<StudioAgent[]>;
  /** The gesture as it comes from a form: checked here by `StudioGesture`. */
  gesture(id: string, gesture: StudioGestureInput): Promise<GestureResult>;
}

/**
 * The studio of the demo, with its own state: a gesture moves a video along the sheet, locally.
 * « ok » sends a waiting video to the next station, and relaunches a failed lane; « refaire » sends it
 * back along its station's return.
 */
export function createDemoStudioSource(
  sheet: WorkflowSheet | null = STUDIO_SHEET.ok ? STUDIO_SHEET.sheet : null,
): StudioSource {
  const now = Date.now();
  const videos = new Map<string, StudioItemDetail>(
    DEMO_VIDEOS.map(({ minutes, ...video }) => [
      video.id,
      { ...video, since: new Date(now - minutes * 60_000).toISOString() },
    ]),
  );
  const move = (video: StudioItemDetail, station: string): StudioItemDetail => {
    const kind = sheet ? kindAt(sheet, station) : undefined;
    return {
      ...video,
      station,
      state: kind === 'owner' ? 'waiting' : kind === 'end' ? 'done' : 'running',
      since: new Date().toISOString(),
      waits: null,
      failure: null,
    };
  };
  return {
    kind: 'demo',
    // An item without its detail: the contract's schema keeps its fields only.
    items: () => Promise.resolve([...videos.values()].map((video) => StudioItem.parse(video))),
    item: (id) => Promise.resolve(videos.get(id) ?? null),
    words: (id) => Promise.resolve([...(DEMO_WORDS[id] ?? [])]),
    agents: () => Promise.resolve(DEMO_AGENTS.map((agent) => ({ ...agent }))),
    gesture: (id, input) => {
      const parsed = StudioGesture.safeParse(input);
      if (!parsed.success) return Promise.resolve({ ok: false, error: parsed.error.message });
      const video = videos.get(id);
      if (!video || !sheet) return Promise.resolve({ ok: false, error: `unknown video ${id}` });
      const { decision } = parsed.data;
      let target: string | undefined;
      if (video.state === 'failed' && decision === 'ok') target = video.station;
      else if (video.state === 'waiting' && kindAt(sheet, video.station) === 'owner')
        target =
          decision === 'ok' ? nextStation(sheet, video.station) : returnOf(sheet, video.station);
      if (target === undefined)
        return Promise.resolve({
          ok: false,
          error: `no ${decision} for ${id} at ${video.station}`,
        });
      videos.set(id, move(video, target));
      return Promise.resolve({ ok: true });
    },
  };
}

/** The live build's studio, until the next piece reads it: no video, no agent, no gesture. */
export function createLiveStudioSource(): StudioSource {
  return {
    kind: 'live',
    items: () => Promise.resolve([]),
    item: () => Promise.resolve(null),
    words: () => Promise.resolve([]),
    agents: () => Promise.resolve([]),
    gesture: () => Promise.resolve({ ok: false, error: 'the live studio is not read yet' }),
  };
}

/** The studio of the build: none on the live build yet, the demo otherwise. */
export function createStudioSource(): StudioSource {
  return import.meta.env.VITE_DATA_SOURCE === 'live'
    ? createLiveStudioSource()
    : createDemoStudioSource();
}
