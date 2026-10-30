import type { PullRequestView } from '@factory-live/contracts';
import {
  GitMergeIcon,
  GitPullRequestClosedIcon,
  GitPullRequestDraftIcon,
  GitPullRequestIcon,
} from '@primer/octicons-react';
import { Badge } from './Badge.tsx';
import { hueOf } from './hues.ts';

/** The icon and color of a PR, as on GitHub: green when open, purple when merged, red when closed. */
const STATE_ICON = {
  open: { icon: GitPullRequestIcon, tone: 'success' },
  merged: { icon: GitMergeIcon, tone: 'done' },
  closed: { icon: GitPullRequestClosedIcon, tone: 'danger' },
  draft: { icon: GitPullRequestDraftIcon, tone: undefined },
} as const;

/**
 * A PR: its repository (PR icon tinted with its state) as the label, its number as the value, in the
 * repository's hue. Link to the PR on GitHub; the state is not always known (PR picked up from
 * Hermes runs): the icon is then that of an open PR, with no color. With no known repository, the
 * number alone.
 */
export function PullRequestBadge({
  repo,
  number,
  url,
  state,
}: {
  repo?: string | undefined;
  number: number;
  url: string;
  state?: PullRequestView['state'];
}) {
  const mark = STATE_ICON[state ?? 'open'];
  return (
    <Badge
      {...(state && mark.tone ? { labelIconTone: mark.tone } : {})}
      {...(repo ? { label: repo, labelIcon: mark.icon, hue: hueOf('repo', repo) } : {})}
      href={url}
      value={`#${number}`}
      code
      yields="label"
      // The accessible name stays the number, as the link had before the badge.
      description={`#${number}`}
    />
  );
}
