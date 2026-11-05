/**
 * The standard blocks of a workflow's graph, the ones every workflow reuses (shown on `/composants`):
 * a station, the kind of its work, an item's row, the providers, a group's frame, the links, the
 * legend and the zoom. A new graph or screen of a workflow is made of these, never of new ones.
 */
export { GroupFrame } from './GroupFrame.tsx';
export { KIND_ICON, PROVIDERS_ICON, octicon } from './icons.ts';
export type { Kind } from './icons.ts';
export { ItemRow } from './ItemRow.tsx';
export { KindChip } from './KindChip.tsx';
export { Legend } from './Legend.tsx';
export { BranchLink, EdgePath, FanLink, LineLink, Link, Port, ReturnArch } from './links.tsx';
export type { LinkVariant } from './links.tsx';
export { ProvidersBlock } from './ProvidersBlock.tsx';
export { StationBlock } from './StationBlock.tsx';
export type { StationLook } from './StationBlock.tsx';
export { entry, useSheetText } from './text.ts';
export type { SheetText } from './text.ts';
export { ZoomControls } from '../zoom.tsx';
