import { Banner } from '@primer/react';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useCodeSheet } from './codeSheet.ts';
import type { SheetState } from './sheetState.ts';
import { WorkflowGraph } from './WorkflowGraph.tsx';
import type { WorkflowGraphProps } from './WorkflowGraph.tsx';

/**
 * A workflow's graph from its sheet: a sheet the core refuses shows why, instead of the graph.
 */
export function SheetGraph({ parsed, ...props }: WorkflowGraphProps & { parsed: SheetState }) {
  const { t } = useI18n();
  if (!parsed.ok)
    return <Banner variant="critical" title={t.workflow.invalid} description={parsed.error} />;
  return <WorkflowGraph {...props} sheet={parsed.sheet} />;
}

/**
 * The factory line as a run graph: the workflows' graph drawn from the code line's sheet, as workflow-core
 * serves it (#31, #72). Before its first sheet, the line says it waits for it, without a broken page; a sheet
 * the core refuses shows why in a banner.
 */
export function FactoryGraph(props: WorkflowGraphProps) {
  const { t } = useI18n();
  const { sheet, refusal } = useCodeSheet();
  // A sheet the core refuses says why; the last one it served stays drawn under the banner.
  const refused =
    refusal === null ? null : (
      <Banner variant="critical" title={t.workflow.invalid} description={refusal} />
    );
  if (!sheet)
    return (
      refused ?? (
        <Banner
          variant="info"
          title={t.workflow.waitingTitle}
          description={t.workflow.waiting}
          hideTitle
        />
      )
    );
  return (
    <>
      {refused}
      <WorkflowGraph {...props} sheet={sheet} />
    </>
  );
}
