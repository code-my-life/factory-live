import type { PullRequestView } from '@factory-live/contracts';
import { StateLabel } from '@primer/react';
import type { ComponentProps } from 'react';
import { useI18n } from '../../i18n/I18nProvider.tsx';

const PR_STATUS: Record<PullRequestView['state'], ComponentProps<typeof StateLabel>['status']> = {
  draft: 'draft',
  open: 'pullOpened',
  merged: 'pullMerged',
  closed: 'pullClosed',
};

/** A pull request's state, as on GitHub: Primer's `StateLabel`, with its icon. */
export function PullRequestState({
  state,
  size = 'medium',
}: {
  state: PullRequestView['state'];
  size?: 'small' | 'medium';
}) {
  const { t } = useI18n();
  return (
    <StateLabel status={PR_STATUS[state]} size={size}>
      {t.pr.state[state]}
    </StateLabel>
  );
}
