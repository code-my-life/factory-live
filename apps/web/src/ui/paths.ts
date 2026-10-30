import type { IssueKey } from '@factory-live/contracts';

/** `claude-cockpit#71` → `/issues/claude-cockpit/71` */
export function issuePath(key: IssueKey): string {
  const [repo, number] = key.split('#');
  return `/issues/${encodeURIComponent(repo ?? '')}/${number ?? ''}`;
}

/** `claude-cockpit#71` → `claude-cockpit` */
export function repoOfKey(key: IssueKey): string {
  return key.slice(0, key.lastIndexOf('#'));
}

export function issueKeyFromParams(
  repo: string | undefined,
  number: string | undefined,
): IssueKey | null {
  if (!repo || !number || !/^\d+$/.test(number)) return null;
  return `${repo}#${number}`;
}
