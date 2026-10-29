import { Badge } from './Badge.tsx';

/** Une version : ce qu'elle versionne en étiquette (Hermès, factory-live), le numéro en police de code. */
export function VersionBadge({ of, version }: { of?: string; version: string }) {
  return <Badge {...(of ? { label: of } : {})} value={version} code />;
}
