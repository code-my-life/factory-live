import type { StationId } from '@factory-live/contracts';
import { StationBadge } from '../badge/StationBadge.tsx';

export { STATION_ICON } from '../badge/StationBadge.tsx';

/**
 * A station named outside the line (issue list, issue header, agent card): its badge, in the
 * station's hue. `label` is what screen readers read (« Étape : Brief »).
 */
export function StationMark({ station, label }: { station: StationId; label?: string }) {
  return <StationBadge {...(label ? { description: label } : {})} station={station} />;
}
