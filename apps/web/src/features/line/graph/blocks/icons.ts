import {
  BeakerIcon,
  CheckCircleIcon,
  CircleIcon,
  CodeIcon,
  CommentIcon,
  EyeIcon,
  FileIcon,
  GearIcon,
  GitMergeIcon,
  ImageIcon,
  IssueOpenedIcon,
  MarkGithubIcon,
  MegaphoneIcon,
  PackageIcon,
  PencilIcon,
  PersonIcon,
  PlayIcon,
  RocketIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparkleFillIcon,
  TagIcon,
  TerminalIcon,
  UploadIcon,
  VideoIcon,
  WorkflowIcon,
} from '@primer/octicons-react';
import type { Icon } from '@primer/octicons-react';
import type { StationKind } from '@factory-live/contracts';

/**
 * The Octicons a sheet may name for its stations and groups, by their Primer name. Only these are
 * bundled; a name outside the list draws a plain circle rather than nothing.
 */
const OCTICONS: Readonly<Record<string, Icon>> = {
  beaker: BeakerIcon,
  'check-circle': CheckCircleIcon,
  code: CodeIcon,
  comment: CommentIcon,
  eye: EyeIcon,
  file: FileIcon,
  gear: GearIcon,
  'git-merge': GitMergeIcon,
  image: ImageIcon,
  'issue-opened': IssueOpenedIcon,
  'mark-github': MarkGithubIcon,
  megaphone: MegaphoneIcon,
  package: PackageIcon,
  pencil: PencilIcon,
  person: PersonIcon,
  play: PlayIcon,
  rocket: RocketIcon,
  search: SearchIcon,
  'shield-check': ShieldCheckIcon,
  'sparkle-fill': SparkleFillIcon,
  tag: TagIcon,
  terminal: TerminalIcon,
  upload: UploadIcon,
  video: VideoIcon,
  workflow: WorkflowIcon,
};

export function octicon(name: string): Icon {
  return Object.hasOwn(OCTICONS, name) ? (OCTICONS[name] as Icon) : CircleIcon;
}

/** The work done at a station, as its chip shows it; the end has none. */
export type Kind = Exclude<StationKind, 'end'>;

export const KIND_ICON: Readonly<Record<Kind, Icon>> = {
  ai: SparkleFillIcon,
  script: TerminalIcon,
  github: MarkGithubIcon,
  owner: PersonIcon,
};

/** The providers' own icon: what an agent calls. */
export const PROVIDERS_ICON: Icon = SparkleFillIcon;
