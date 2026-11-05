import { parseWorkflowSheet } from '@factory-live/contracts';
import type { WorkflowSheetResult } from '@factory-live/contracts';
import { useEffect, useState } from 'react';
import { CODE_LINE_SHEET } from './layout.ts';

/**
 * The code line's sheet as the factory publishes it (`config/workflow.json`, #31), read through this
 * server on the live build. The embedded copy (`workflows/code-line.json`) is drawn until it is read,
 * on the demo, and whenever the published sheet is missing or invalid: the Health page says why.
 */

const EVERY_MS = 5 * 60_000;

let published: WorkflowSheetResult | null = null;
let reading: Promise<WorkflowSheetResult> | null = null;
let readAt = 0;

export async function readCodeSheet(
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<WorkflowSheetResult> {
  try {
    const response = await fetchImpl('/api/workflows', { headers: { Accept: 'application/json' } });
    if (!response.ok) return CODE_LINE_SHEET;
    const body = (await response.json()) as { code?: { source?: string; sheet?: unknown } | null };
    if (body.code?.source !== 'published') return CODE_LINE_SHEET;
    const parsed = parseWorkflowSheet(body.code.sheet);
    return parsed.ok ? parsed : CODE_LINE_SHEET;
  } catch {
    return CODE_LINE_SHEET;
  }
}

/** The sheet the code line is drawn from: the published one on the live build, else the embedded copy. */
export function useCodeSheet(): WorkflowSheetResult {
  const live = import.meta.env.VITE_DATA_SOURCE === 'live';
  const [sheet, setSheet] = useState<WorkflowSheetResult>(() => published ?? CODE_LINE_SHEET);
  useEffect(() => {
    if (!live) return;
    let current = true;
    const refresh = () => {
      if (Date.now() - readAt > EVERY_MS) {
        readAt = Date.now();
        reading ??= readCodeSheet().finally(() => {
          reading = null;
        });
      }
      void (reading ?? Promise.resolve(published ?? CODE_LINE_SHEET)).then((next) => {
        published = next;
        // The same sheet keeps its object: the graph does not lay itself out again for nothing.
        if (current)
          setSheet((last) => (JSON.stringify(last) === JSON.stringify(next) ? last : next));
      });
    };
    refresh();
    // An open line sees a sheet the factory publishes later, or comes back from a failed read.
    const timer = setInterval(refresh, EVERY_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [live]);
  return live ? sheet : CODE_LINE_SHEET;
}
