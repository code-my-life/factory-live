import type { StationId } from '@factory-live/contracts';
import {
  BlockedIcon,
  CheckCircleIcon,
  CodeIcon,
  IssueOpenedIcon,
  RocketIcon,
  ShieldCheckIcon,
  WorkflowIcon,
} from '@primer/octicons-react';
import type { Icon } from '@primer/octicons-react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Badge } from './Badge.tsx';
import { hueOf } from './hues.ts';

/** The icon of each station: the same on the line's stop and on its badge elsewhere. */
export const STATION_ICON: Record<StationId, Icon> = {
  intake: IssueOpenedIcon,
  brief: WorkflowIcon,
  implementation: CodeIcon,
  gate: ShieldCheckIcon,
  release: RocketIcon,
  done: CheckCircleIcon,
  stopped: BlockedIcon,
  side: WorkflowIcon,
};

/**
 * A station named outside the line (issue list, issue header, agent card): the station's icon
 * and the word « poste » as the label, its name as the value, in its hue. `description` tells
 * screen readers something other than « poste : Gate » (« Étape : Gate »).
 */
export function StationBadge({
  station,
  description,
}: {
  station: StationId;
  description?: string;
}) {
  const { t } = useI18n();
  return (
    <Badge
      {...(description ? { description } : {})}
      label={t.badge.station}
      labelIcon={STATION_ICON[station]}
      value={t.station[station]}
      hue={hueOf('station', station)}
    />
  );
}
