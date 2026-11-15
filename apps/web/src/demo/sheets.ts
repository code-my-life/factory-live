import { WorkflowSheet } from '@factory-live/contracts';
import factory from './sheets/factory.json';
import studio from './sheets/studio.json';

/*
 * The sheets of the demonstration: the code line's and the studio's, as workflow-core served them when they
 * were copied here. The live build never draws them: it draws the sheets the core serves (#72). Their form
 * is checked by the contract's schema, the way the core's own schema checks the sheets it serves.
 */

export const DEMO_CODE_LINE: WorkflowSheet = WorkflowSheet.parse(factory);
export const DEMO_STUDIO: WorkflowSheet = WorkflowSheet.parse(studio);
