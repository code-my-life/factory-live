import { WorkflowSheet } from '@factory-live/contracts';

/*
 * The sheets of the components' page (`/composants`), as demonstration data: a video studio of three
 * stations, one per kind of work that varies, in the page's language; and the refusal the core gives for a
 * sheet whose station comes twice, as it says it.
 */

export interface SampleLabels {
  item: string;
  write: string;
  render: string;
  approve: string;
  again: string;
}

export function sampleStudioSheet(s: SampleLabels): WorkflowSheet {
  return WorkflowSheet.parse({
    item: { type: 'video', label: s.item },
    stations: [
      { key: 'write', label: s.write, icon: 'pencil', kind: 'ai', col: 0, row: 1 },
      { key: 'render', label: s.render, icon: 'video', kind: 'script', col: 1, row: 1 },
      { key: 'approve', label: s.approve, icon: 'eye', kind: 'owner', col: 2, row: 1 },
    ],
    edges: [
      { from: 'write', to: 'render', kind: 'line' },
      { from: 'render', to: 'approve', kind: 'line' },
      { from: 'approve', to: 'write', kind: 'return', label: s.again },
    ],
    models: ['write'],
  });
}

/** The core's refusal of a sheet whose station `write` comes twice. */
export const SAMPLE_REFUSAL = 'duplicate station "write"';
