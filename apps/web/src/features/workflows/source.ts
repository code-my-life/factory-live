import { DeclaredDataList, GenericWorkflows, parseWorkflowSheet } from '@factory-live/contracts';
import type { DeclaredData } from '@factory-live/contracts';
import { demoWorkflows } from '../../demo/workflows.ts';
import type { GenericWorkflow } from './model.ts';

/** What a declared data is about: an item (a card of the core) or a run. */
export type DataSubject = 'card' | 'run';

/** Where the generic screens read their workflows and the data those declare (#65). */
export interface WorkflowsSource {
  kind: 'demo' | 'live';
  /** Every generic workflow; `null` when this server cannot be read (the last ones stay). */
  workflows(): Promise<GenericWorkflow[] | null>;
  /** The data the workflow declares for this item or run; none when it declares or answers none. */
  data(workflow: string, subject: DataSubject, id: string): Promise<DeclaredData[]>;
}

/**
 * The live build's generic workflows, read through this server (`/api/core-workflows`), which reads
 * them from workflow-core. A server on Hermes' side declares none.
 */
export function createLiveWorkflowsSource(
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): WorkflowsSource {
  const json = async (path: string): Promise<unknown> => {
    const response = await fetchImpl(path, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`${path} : ${response.status}`);
    return response.json();
  };
  return {
    kind: 'live',
    async workflows() {
      try {
        const parsed = GenericWorkflows.safeParse(await json('/api/core-workflows'));
        if (!parsed.success) return null;
        return parsed.data.workflows.map((workflow) => ({
          key: workflow.name,
          sheet:
            workflow.sheetError !== null
              ? { ok: false, error: workflow.sheetError }
              : parseWorkflowSheet(workflow.sheet),
          items: workflow.items,
          unreachableSince:
            workflow.unreachableSince === null ? null : Date.parse(workflow.unreachableSince),
        }));
      } catch {
        return null;
      }
    },
    async data(workflow, subject, id) {
      try {
        const query = `subject=${subject}&id=${encodeURIComponent(id)}`;
        const parsed = DeclaredDataList.safeParse(
          await json(`/api/core-workflows/${encodeURIComponent(workflow)}/data?${query}`),
        );
        return parsed.success ? parsed.data.data : [];
      } catch {
        return [];
      }
    },
  };
}

/**
 * The states the demo can show its made-up workflow in, by `?etat=` in the address (the end-to-end
 * tests and the captures use it): no item, the first read, the core not answering, the sheet refused.
 */
export type DemoState = 'vide' | 'chargement' | 'injoignable' | 'refusee';

/** The core's refusal of a sheet, as the demo shows it (imitating the core's text). */
const REFUSED = 'duplicate-station : la station « redaction » est déclarée deux fois.';

export function createDemoWorkflowsSource(
  now = Date.now(),
  state: DemoState | null = null,
): WorkflowsSource {
  const demo = demoWorkflows(now);
  return {
    kind: 'demo',
    workflows() {
      if (state === 'chargement') return new Promise(() => {});
      return Promise.resolve(
        demo.map(({ workflow }) => ({
          ...workflow,
          items: state === 'vide' ? [] : workflow.items,
          unreachableSince: state === 'injoignable' ? now - 7 * 60_000 : null,
          sheet: state === 'refusee' ? { ok: false as const, error: REFUSED } : workflow.sheet,
        })),
      );
    },
    data(workflow, subject, id) {
      const found = demo.find((each) => each.workflow.key === workflow);
      const data = subject === 'card' ? found?.itemData[id] : found?.runData[Number(id)];
      return Promise.resolve(data ?? []);
    },
  };
}

const DEMO_STATES = new Set<string>(['vide', 'chargement', 'injoignable', 'refusee']);

/** The build's source: the live server's on the live build, the demo's otherwise. */
export function createWorkflowsSource(): WorkflowsSource {
  if (import.meta.env.VITE_DATA_SOURCE === 'live') return createLiveWorkflowsSource();
  const state = new URLSearchParams(window.location.search).get('etat');
  return createDemoWorkflowsSource(
    Date.now(),
    state !== null && DEMO_STATES.has(state) ? (state as DemoState) : null,
  );
}
