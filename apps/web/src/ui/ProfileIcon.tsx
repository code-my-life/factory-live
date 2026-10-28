import {
  CodeIcon,
  PencilIcon,
  RocketIcon,
  ShieldCheckIcon,
  ToolsIcon,
  WorkflowIcon,
} from '@primer/octicons-react';

/** Une icône par rôle : le suffixe -claude ou -opencode ne change pas le rôle. */
export function ProfileIcon({ profile, size = 16 }: { profile: string; size?: number }) {
  if (profile.startsWith('coordinator')) return <WorkflowIcon size={size} aria-hidden="true" />;
  if (profile.startsWith('coder')) return <CodeIcon size={size} aria-hidden="true" />;
  if (profile.startsWith('gate')) return <ShieldCheckIcon size={size} aria-hidden="true" />;
  if (profile === 'scribe') return <PencilIcon size={size} aria-hidden="true" />;
  if (profile === 'release') return <RocketIcon size={size} aria-hidden="true" />;
  return <ToolsIcon size={size} aria-hidden="true" />;
}
