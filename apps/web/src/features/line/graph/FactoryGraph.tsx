import type { WorkflowSheetResult } from '@factory-live/contracts';
import { Banner } from '@primer/react';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useCodeSheet } from './codeSheet.ts';
import { WorkflowGraph } from './WorkflowGraph.tsx';
import type { WorkflowGraphProps } from './WorkflowGraph.tsx';

/**
 * A workflow's graph from its read sheet: a sheet that does not hold shows why, instead of the
 * graph.
 */
export function SheetGraph({
  parsed,
  ...props
}: WorkflowGraphProps & { parsed: WorkflowSheetResult }) {
  const { t } = useI18n();
  if (!parsed.ok)
    return <Banner variant="critical" title={t.workflow.invalid} description={parsed.error} />;
  return <WorkflowGraph {...props} sheet={parsed.sheet} />;
}

/**
 * The factory line as a run graph: the workflows' graph drawn from the code line's sheet, as the
 * factory publishes it, with the embedded copy (`workflows/code-line.json`) as its fallback (#31).
 */
export function FactoryGraph(props: WorkflowGraphProps) {
  return <SheetGraph {...props} parsed={useCodeSheet()} />;
}
