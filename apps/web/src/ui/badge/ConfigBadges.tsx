import { DashboardIcon, PlugIcon, ServerIcon, ToolsIcon } from '@primer/octicons-react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Badge } from './Badge.tsx';
import { hueOf } from './hues.ts';

/** A toolset of an agent. A `mcp-<server>` toolset has no badge: its server has its own. */
export function ToolsetBadge({ name }: { name: string }) {
  const { t } = useI18n();
  return (
    <Badge
      label={t.badge.toolset}
      labelIcon={ToolsIcon}
      value={name}
      hue={hueOf('toolset', name)}
    />
  );
}

/** Un serveur MCP d'un agent. */
export function McpBadge({ name }: { name: string }) {
  const { t } = useI18n();
  return <Badge label={t.badge.mcp} labelIcon={ServerIcon} value={name} hue={hueOf('mcp', name)} />;
}

/** A plugin of an agent; its refusals and overruns stay as text, after the badge. */
export function PluginBadge({ name }: { name: string }) {
  const { t } = useI18n();
  return (
    <Badge label={t.badge.plugin} labelIcon={PlugIcon} value={name} hue={hueOf('plugin', name)} />
  );
}

/** L'effort de raisonnement d'un agent : sa teinte est celle de son niveau. */
export function EffortBadge({ level, description }: { level: string; description?: string }) {
  const { t } = useI18n();
  return (
    <Badge
      {...(description ? { description } : {})}
      label={t.badge.effort}
      labelIcon={DashboardIcon}
      value={level}
      hue={hueOf('effort', level)}
    />
  );
}
