import {
  ApiError,
  StudioGesture,
  StudioItem,
  StudioItemDetail,
  StudioWord,
} from '@factory-live/contracts';
import type { StudioGestureInput, WorkflowSheet } from '@factory-live/contracts';
import { z } from 'zod';
import { DEMO_STUDIO } from '../../demo/sheets.ts';
import { DEMO_AGENTS, DEMO_DERIVED_WORDS, DEMO_VIDEOS, DEMO_WORDS } from '../../demo/studio.ts';
import { sheetStateOf } from '../line/graph/sheetState.ts';
import type { SheetState } from '../line/graph/sheetState.ts';
import { kindAt, nextStation, returnOf } from './model.ts';
import type { StudioAgent } from './model.ts';

/** The answer to a gesture: done, or refused with why (the state stays as it was). */
export type GestureResult = { ok: true } | { ok: false; error: string };

/** The studio's sheet, and whether it answers. */
export interface StudioStatus {
  /** False when this server follows no studio: the page and its tab are not shown. */
  configured: boolean;
  /** False until the studio has given a sheet: the page says it is reading, not why it failed. */
  sheetRead: boolean;
  sheet: SheetState;
  /** Since when the studio does not answer (ms), or `null`: the last state read stays shown. */
  unreachableSince: number | null;
  error: string | null;
}

/**
 * Where the studio's page reads the studio: its sheet, its videos, a video's detail and aligned words,
 * its agents, and the owner's gesture. The demo has its own studio; the live one is read through this
 * server, which follows the studio's generic API (#31) for its videos, and serves the sheet workflow-core
 * judged (#72).
 */
export interface StudioSource {
  readonly kind: 'demo' | 'live';
  status(): Promise<StudioStatus>;
  items(): Promise<StudioItem[]>;
  item(id: string): Promise<StudioItemDetail | null>;
  words(id: string): Promise<StudioWord[]>;
  /**
   * True when this video's aligned words are derived from its script at a fixed pace, not those of
   * a master.
   */
  wordsDerived(id: string): boolean;
  agents(): Promise<StudioAgent[]>;
  /** The gesture as it comes from a form: checked here by `StudioGesture`. */
  gesture(id: string, gesture: StudioGestureInput): Promise<GestureResult>;
}

/**
 * The studio of the demo, with its own state: a gesture moves a video along the sheet, locally.
 * « ok » sends a waiting video to the next station, and relaunches a failed lane; « refaire » sends it
 * back along its station's return.
 */
export function createDemoStudioSource(sheet: WorkflowSheet | null = DEMO_STUDIO): StudioSource {
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
    status: () =>
      Promise.resolve({
        configured: true,
        sheetRead: true,
        sheet: { ok: true, sheet: DEMO_STUDIO },
        unreachableSince: null,
        error: null,
      }),
    // An item without its detail: the contract's schema keeps its fields only.
    items: () => Promise.resolve([...videos.values()].map((video) => StudioItem.parse(video))),
    item: (id) => Promise.resolve(videos.get(id) ?? null),
    words: (id) => Promise.resolve([...(DEMO_WORDS[id] ?? [])]),
    wordsDerived: (id) => DEMO_DERIVED_WORDS.has(id),
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

const WorkflowView = z.object({
  sheet: z.unknown(),
  sheetRefusal: z.string().nullable(),
  items: z.array(StudioItem),
  unreachableSince: z.number().nullable(),
  error: z.string().nullable(),
});

const NOT_READ: StudioStatus = {
  configured: true,
  sheetRead: false,
  sheet: { ok: false, error: '' },
  unreachableSince: null,
  error: null,
};

/**
 * The live studio, read through this server (`/api/workflows/studio`): the sheet the core serves and the
 * videos in one read, shared by the calls that come together. No studio configured: a studio with nothing in
 * it.
 */
export function createLiveStudioSource(
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  base = '',
): StudioSource {
  const at = `${base}/api/workflows/studio`;
  let reading: Promise<{ status: StudioStatus; items: StudioItem[] }> | null = null;
  let last: { status: StudioStatus; items: StudioItem[] } = { status: NOT_READ, items: [] };
  // The last detail and words read of each video: an outage keeps them on screen.
  const details = new Map<string, StudioItemDetail>();
  const wordsRead = new Map<string, StudioWord[]>();
  const read = () => {
    reading ??= fetchImpl(at, { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (response.status === 404)
          return { status: { ...NOT_READ, configured: false }, items: [] };
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const view = WorkflowView.parse(await response.json());
        // No sheet yet and no refusal: still waiting for the core's sheet (#72). A refusal is the core's
        // own, shown as is; the last sheet it served stays drawn.
        const sheetRead = view.sheet !== null || view.sheetRefusal !== null;
        const sheet: SheetState =
          view.sheet === null
            ? { ok: false, error: view.sheetRefusal ?? '' }
            : sheetStateOf(view.sheet, null);
        return {
          status: {
            configured: true,
            sheetRead,
            sheet,
            unreachableSince: view.unreachableSince,
            error: view.error,
          },
          items: view.items,
        };
      })
      // This server does not answer: the last state stays, and says so.
      .catch((error: unknown) => ({
        status: {
          ...last.status,
          unreachableSince: last.status.unreachableSince ?? Date.now(),
          error: error instanceof Error ? error.message : String(error),
        },
        items: last.items,
      }))
      .then((value) => {
        last = value;
        return value;
      })
      .finally(() => {
        reading = null;
      });
    return reading;
  };
  const json = async (url: string) => {
    const response = await fetchImpl(`${at}${url}`, { headers: { Accept: 'application/json' } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as unknown;
  };
  return {
    kind: 'live',
    status: async () => (await read()).status,
    items: async () => (await read()).items,
    // The studio does not answer: the detail last read, else the video as the last list read it.
    item: async (id) => {
      try {
        const body = await json(`/items/${encodeURIComponent(id)}`);
        const detail = body === null ? null : StudioItemDetail.parse(body);
        if (detail) details.set(id, detail);
        else details.delete(id);
        return detail;
      } catch {
        const kept = details.get(id);
        if (kept) return kept;
        const known = last.items.find((item) => item.id === id);
        return known ? { ...known, script: '', steps: [], files: [], links: {} } : null;
      }
    },
    // The studio's words are always those of a master.
    wordsDerived: () => false,
    // Words that cannot be read are the ones last read, never a failure of the detail.
    words: async (id) => {
      try {
        const body = await json(`/items/${encodeURIComponent(id)}/words`);
        const words =
          body === null ? [] : z.object({ words: z.array(StudioWord) }).parse(body).words;
        wordsRead.set(id, words);
        return words;
      } catch {
        return wordsRead.get(id) ?? [];
      }
    },
    // The studio names no agent in its API: the providers' box stays empty on the live build.
    agents: () => Promise.resolve([]),
    gesture: async (id, input) => {
      const parsed = StudioGesture.safeParse(input);
      if (!parsed.success) return { ok: false, error: parsed.error.message };
      let response: Response;
      try {
        response = await fetchImpl(`${at}/items/${encodeURIComponent(id)}/gesture`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Factory-Live': '1' },
          body: JSON.stringify(parsed.data),
        });
      } catch (error) {
        // No answer: refused, and the form is free again.
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
      if (response.ok) return { ok: true };
      const refusal = ApiError.safeParse(await response.json().catch(() => null));
      return {
        ok: false,
        error: refusal.success ? refusal.data.error : `HTTP ${response.status}`,
      };
    },
  };
}

/** The studio of the build: read through this server on the live build, the demo otherwise. */
export function createStudioSource(): StudioSource {
  return import.meta.env.VITE_DATA_SOURCE === 'live'
    ? createLiveStudioSource()
    : createDemoStudioSource();
}
