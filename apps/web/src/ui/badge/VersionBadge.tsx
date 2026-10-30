import { VersionsIcon } from '@primer/octicons-react';
import { Badge } from './Badge.tsx';
import { hueOf } from './hues.ts';

/**
 * A version: what it versions as the label (Hermes, factory-live), the number in a code font,
 * in the hue of its product. `tag` is reserved for GitHub labels.
 */
export function VersionBadge({ of, version }: { of?: string; version: string }) {
  return (
    <Badge
      {...(of ? { label: of, labelIcon: VersionsIcon, hue: hueOf('product', of) } : {})}
      value={version}
      code
    />
  );
}
