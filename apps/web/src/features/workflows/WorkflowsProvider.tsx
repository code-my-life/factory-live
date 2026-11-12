import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { GenericWorkflow } from './model.ts';
import { createLiveWorkflowsSource, createWorkflowsSource } from './source.ts';
import type { WorkflowsSource } from './source.ts';

export interface WorkflowsState {
  source: WorkflowsSource;
  /** False until the generic workflows have been read once. */
  ready: boolean;
  /** The workflows the core declares besides the code line and the studio. */
  workflows: readonly GenericWorkflow[];
}

const EMPTY_SOURCE = createLiveWorkflowsSource();
const WorkflowsContext = createContext<WorkflowsState>({
  source: EMPTY_SOURCE,
  ready: true,
  workflows: [],
});

/** The live workflows are read again every so often, while the page is shown. */
const LIVE_EVERY_MS = 5_000;

/** The generic workflows for the screens under it (#65): the given source, else the build's. */
export function WorkflowsProvider({
  source: given,
  children,
}: {
  source?: WorkflowsSource;
  children: ReactNode;
}) {
  const [source] = useState(() => given ?? createWorkflowsSource());
  const [workflows, setWorkflows] = useState<readonly GenericWorkflow[] | null>(null);

  useEffect(() => {
    let current = true;
    const once = () =>
      void source.workflows().then((read) => {
        // A failed read keeps the last workflows: the screen says the core does not answer.
        if (current && read !== null) setWorkflows(read);
        else if (current) setWorkflows((last) => last ?? []);
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

  const value = useMemo<WorkflowsState>(
    () => ({ source, ready: workflows !== null, workflows: workflows ?? [] }),
    [source, workflows],
  );
  return <WorkflowsContext.Provider value={value}>{children}</WorkflowsContext.Provider>;
}

export function useWorkflows(): WorkflowsState {
  return useContext(WorkflowsContext);
}
