import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { demoWorkflows } from '../../demo/workflows.ts';
import type { GenericWorkflow } from './model.ts';

/**
 * The states the mockup of the generic screen can show (#64): the workflow as it is, then no item,
 * the first read, the core not answering, the sheet refused. Only the demo offers to switch them.
 */
export type Preview = 'normal' | 'empty' | 'loading' | 'unreachable' | 'refused';

export interface WorkflowsState {
  /** False until the generic workflows have been read once. */
  ready: boolean;
  /** The workflows the core declares besides the code line and the studio. */
  workflows: readonly GenericWorkflow[];
  /** Whether the build offers to switch the mockup's states (the demo). */
  previewable: boolean;
  preview: Preview;
  setPreview: (preview: Preview) => void;
}

const WorkflowsContext = createContext<WorkflowsState>({
  ready: true,
  workflows: [],
  previewable: false,
  preview: 'normal',
  setPreview: () => {},
});

/** The core's refusal of a sheet, as the screen shows it (the mockup's text, imitating the core's). */
const REFUSED = 'duplicate-station : la station « redaction » est déclarée deux fois.';

/** The workflow in the state the mockup shows. */
function inPreview(workflow: GenericWorkflow, preview: Preview, now: number): GenericWorkflow {
  if (preview === 'empty') return { ...workflow, items: [] };
  if (preview === 'unreachable') return { ...workflow, unreachableSince: now - 7 * 60_000 };
  if (preview === 'refused') return { ...workflow, sheet: { ok: false, error: REFUSED } };
  return workflow;
}

/**
 * The generic workflows for the screens under it (#65). The demo serves its made-up workflow; the
 * live build reads none yet: the screen comes with #65, from the core's `GET /api/workflows`.
 */
export function WorkflowsProvider({ children }: { children: ReactNode }) {
  const demo = import.meta.env.VITE_DATA_SOURCE !== 'live';
  const [now] = useState(() => Date.now());
  const [preview, setPreview] = useState<Preview>('normal');
  const value = useMemo<WorkflowsState>(() => {
    const workflows = demo ? demoWorkflows(now) : [];
    return {
      ready: preview !== 'loading',
      workflows: workflows.map((workflow) => inPreview(workflow, preview, now)),
      previewable: demo,
      preview,
      setPreview,
    };
  }, [demo, now, preview]);
  return <WorkflowsContext.Provider value={value}>{children}</WorkflowsContext.Provider>;
}

export function useWorkflows(): WorkflowsState {
  return useContext(WorkflowsContext);
}
