import { WorkflowSheet } from '@factory-live/contracts';
import { useEffect, useState } from 'react';
import { DEMO_CODE_LINE } from '../../../demo/sheets.ts';

/**
 * The code line's sheet as workflow-core serves it (#31, #72), read through this server on the live build:
 * nothing before the core's first sheet (the line waits for it), then the last one served, kept while the
 * core or this server does not answer, and on the device: the app opened offline draws the line on the last
 * sheet it received, as it shows the last state. No copy of the sheet is embedded in the app; the demo draws
 * its own.
 */

const EVERY_MS = 60_000;
/** Where the device keeps the last sheet received (`localStorage`, beside the last state). */
const KEPT = 'factory-live:code-sheet';

/** The sheet the device kept; `null` without one, or where the storage cannot be read. */
function keptSheet(): WorkflowSheet | null {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEPT);
    if (!raw) return null;
    const parsed = WorkflowSheet.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function keepSheet(sheet: WorkflowSheet): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEPT, JSON.stringify(sheet));
  } catch {
    // A storage that refuses (private mode, full): the sheet stays in memory only.
  }
}

let published: WorkflowSheet | null = null;
let refused: string | null = null;
let reading: Promise<CodeSheet | null> | null = null;
let readAt = 0;

/** The code line's sheet as this server serves it: the last sheet the core served, and why it refuses the next. */
export interface CodeSheet {
  sheet: WorkflowSheet | null;
  /** Why the core refuses its sheet, as it says it; `null` while it accepts it. */
  refusal: string | null;
}

/** What this server serves now; `null` while it has nothing yet, or does not answer. */
export async function readCodeSheet(
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<CodeSheet | null> {
  try {
    const response = await fetchImpl('/api/workflows', { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      code?: { source?: string; sheet?: unknown; refusal?: unknown } | null;
    };
    if (body.code?.source !== 'published') return null;
    const refusal = typeof body.code.refusal === 'string' ? body.code.refusal : null;
    // The core judged the sheet; its form is checked by the contract's schema, as the server's own.
    const parsed = WorkflowSheet.safeParse(body.code.sheet);
    if (!parsed.success && refusal === null) return null;
    return { sheet: parsed.success ? parsed.data : null, refusal };
  } catch {
    return null;
  }
}

/**
 * The sheet the code line is drawn from: on the live build, the last one the core served (`null` before the
 * first), and why the core refuses its sheet, if it does; the demo's on the demo build.
 */
export function useCodeSheet(): CodeSheet {
  const live = import.meta.env.VITE_DATA_SOURCE === 'live';
  const [state, setState] = useState<CodeSheet>(() => ({
    sheet: live ? (published ??= keptSheet()) : null,
    refusal: live ? refused : null,
  }));
  useEffect(() => {
    if (!live) return;
    let current = true;
    const refresh = () => {
      // Until the first sheet, asked at each turn; then once a minute.
      if (published === null || Date.now() - readAt > EVERY_MS) {
        readAt = Date.now();
        reading ??= readCodeSheet().finally(() => {
          reading = null;
        });
      }
      void (reading ?? Promise.resolve(null)).then((next) => {
        // No answer, or nothing yet: the last sheet read stays.
        if (next) {
          if (next.sheet && JSON.stringify(next.sheet) !== JSON.stringify(published))
            keepSheet(next.sheet);
          published = next.sheet ?? published;
          refused = next.refusal;
        }
        const shown = { sheet: published, refusal: refused };
        // The same sheet keeps its object: the graph does not lay itself out again for nothing.
        if (current)
          setState((last) => (JSON.stringify(last) === JSON.stringify(shown) ? last : shown));
      });
    };
    refresh();
    const timer = setInterval(refresh, 5_000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [live]);
  return live ? state : DEMO;
}

const DEMO: CodeSheet = { sheet: DEMO_CODE_LINE, refusal: null };
