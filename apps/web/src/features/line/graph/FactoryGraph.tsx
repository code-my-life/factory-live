import { Banner } from '@primer/react';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { CODE_LINE_SHEET } from './layout.ts';
import { WorkflowGraph } from './WorkflowGraph.tsx';
import type { WorkflowGraphProps } from './WorkflowGraph.tsx';

/**
 * The factory line as a run graph: the workflows' graph drawn from the code line's sheet
 * (`workflows/code-line.json`). A sheet that does not hold shows why, instead of the graph.
 */
export function FactoryGraph(props: WorkflowGraphProps) {
  const { t } = useI18n();
  if (!CODE_LINE_SHEET.ok)
    return (
      <Banner variant="critical" title={t.workflow.invalid} description={CODE_LINE_SHEET.error} />
    );
  return <WorkflowGraph {...props} sheet={CODE_LINE_SHEET.sheet} />;
}
