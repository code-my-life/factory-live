import { z } from 'zod';
import { Timestamp } from './common.ts';

/**
 * The acceptance of a PR (« la recette ») : what the issue asked, the CI and the gate, the tests, the
 * proofs and the twins of the app, as facts read on GitHub and in the factory, never as code. Every
 * text below comes from elsewhere (the issue, the PR, GitHub, the gate's comment) and is shown as is;
 * the interface writes its own words from the codes.
 */

/** The verdict of one element, as the owner reads it: OK, NOK, or not known yet (CI still running). */
export const AcceptanceStatus = z.enum(['ok', 'nok', 'pending']);
export type AcceptanceStatus = z.infer<typeof AcceptanceStatus>;

/** A criterion of the issue (C1, C2…) and what proves it. */
export const AcceptanceCriterion = z.object({
  id: z.string().regex(/^C\d+$/),
  /** The criterion as the issue writes it. */
  text: z.string(),
  status: AcceptanceStatus,
  /** Why: its proof passes, the PR says it is not proven, its proof fails, the CI still runs. */
  reason: z.enum(['proven', 'unproven', 'failing', 'running']),
  /** The proof as the PR's « Critères » section writes it, as is; `null` when the PR names none. */
  proof: z.string().nullable(),
  /** Where it is on GitHub: the proving test at the head, or the PR's criteria when unproven. */
  url: z.url(),
});
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterion>;

/** A check of the PR's head: a job of a workflow, or a commit status such as `factory/gate`. */
export const AcceptanceCheck = z.object({
  name: z.string(),
  /** The workflow of the job (« CI », « CodeQL »…); `null` for a commit status. */
  workflow: z.string().nullable(),
  status: z.enum(['success', 'failure', 'pending', 'skipped']),
  durationMs: z.number().int().nonnegative().nullable(),
  url: z.url(),
});
export type AcceptanceCheck = z.infer<typeof AcceptanceCheck>;

/** A rule of the scripted gate, as its comment on the PR writes it. */
export const AcceptanceGateRule = z.object({
  /** The rule's label in the gate's comment (Type, Version, Fail-first, Couverture du diff…). */
  rule: z.string(),
  status: z.enum(['ok', 'nok', 'info']),
  detail: z.string(),
});
export type AcceptanceGateRule = z.infer<typeof AcceptanceGateRule>;

/** The gate's last verdict on the PR. */
export const AcceptanceGate = z.object({
  status: AcceptanceStatus,
  /** The head the gate judged. */
  head: z.string(),
  at: Timestamp.nullable(),
  /** The gate's comment on the PR. */
  url: z.url(),
  rules: z.array(AcceptanceGateRule),
});
export type AcceptanceGate = z.infer<typeof AcceptanceGate>;

/** A failed test, named as its runner reports it, with its place in the code at the head. */
export const AcceptanceTestFailure = z.object({
  name: z.string(),
  url: z.url(),
});
export type AcceptanceTestFailure = z.infer<typeof AcceptanceTestFailure>;

/** One run of a test suite at the head: unit tests, or a project of the end-to-end tests. */
export const AcceptanceTestSuite = z.object({
  kind: z.enum(['unit', 'e2e']),
  /** The runner or the project, as its report names it (« Vitest », « WebKit iPhone »…). */
  name: z.string(),
  status: AcceptanceStatus,
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative().nullable(),
  /** The CI job that ran it. */
  url: z.url(),
  failures: z.array(AcceptanceTestFailure),
});
export type AcceptanceTestSuite = z.infer<typeof AcceptanceTestSuite>;

/**
 * A proof of the PR. Textual: the gate's for its type, a command's run, the build, the coverage, a
 * measure, with the text itself. Visual: a capture before and after. Declared: what the PR itself
 * says it does not prove, for the owner to judge (« info »).
 */
export const AcceptanceProof = z.object({
  kind: z.enum([
    'failfirst',
    'sabotage',
    'invariance',
    'documents',
    'skill',
    'build',
    'coverage',
    'run',
    'measure',
    'capture',
    'unproven',
  ]),
  status: z.enum(['ok', 'nok', 'pending', 'info']),
  /** What it shows, as the gate, the CI or the PR writes it. */
  detail: z.string(),
  url: z.url(),
  /** The text of a textual proof (a command's output, a report), as is. */
  content: z.string().nullable().default(null),
  /** A capture: the picture on the base, then on the head (address of the image). */
  before: z.string().nullable().default(null),
  after: z.string().nullable().default(null),
});
export type AcceptanceProof = z.infer<typeof AcceptanceProof>;

/** A review thread on the PR (Greptile, the gate, the owner…), and whether it was resolved. */
export const AcceptanceThread = z.object({
  /** The author's login, as GitHub gives it. */
  author: z.string(),
  /** The thread's own mark of severity when it has one (« P1 »), as is. */
  severity: z.string().nullable(),
  /** The thread's title or first line, as is. */
  title: z.string(),
  resolved: z.boolean(),
  at: Timestamp,
  url: z.url(),
});
export type AcceptanceThread = z.infer<typeof AcceptanceThread>;

/**
 * A twin: the app at one commit, running in the factory's twin bench (a container per commit) and
 * streamed by Neko. The reviewer's gestures on one are replayed on the other.
 */
export const AcceptanceTwin = z.object({
  sha: z.string(),
  /** The twin's Neko session on the bench; `null` until the bench has started it. */
  stream: z.string().nullable(),
  /** A still of the twin's screen, shown until the stream connects (the address of an image). */
  poster: z.string().nullable(),
});
export type AcceptanceTwin = z.infer<typeof AcceptanceTwin>;

/** A surface of the product the PR may touch (the app, its API, the site, the docs…), with its twins. */
export const AcceptanceSurface = z.object({
  id: z.string(),
  /** The surface's name in the repository's twins manifest, as is. */
  label: z.string(),
  kind: z.enum(['web', 'desktop', 'terminal', 'api', 'site', 'docs']),
  /** Whether the PR's changed files reach this surface. */
  changed: z.boolean(),
  base: AcceptanceTwin,
  head: AcceptanceTwin,
  /** How many places differ on the screen shown, once the bench compared both; `null` before. */
  differences: z.number().int().nonnegative().nullable(),
});
export type AcceptanceSurface = z.infer<typeof AcceptanceSurface>;

/** The app before and after the PR, both alive in the bench, surface by surface. */
export const AcceptanceTwins = z.object({
  surfaces: z.array(AcceptanceSurface).min(1),
  state: z.enum(['starting', 'ready', 'stopped']),
  /** A gesture the other twin could not replay (the mirror waits), as the bench words it. */
  divergence: z.string().nullable(),
});
export type AcceptanceTwins = z.infer<typeof AcceptanceTwins>;

/** One of the pair: the app at the PR's base, or at its head. */
export const TwinSide = z.enum(['base', 'head']);
export type TwinSide = z.infer<typeof TwinSide>;

/**
 * What the PWA needs to watch a twin as a Neko client (#23, ADR 0013): the twin's WebSocket, at the
 * host the PWA came by, and a viewer's token the server obtained (the session's password stays there).
 */
export const TwinSession = z.object({
  ws: z.string(),
  token: z.string(),
  /** The address to put in the twin's ICE candidates (this PC: the tailnet does not answer it); `null`: as announced. */
  candidateHost: z.string().nullable(),
});
export type TwinSession = z.infer<typeof TwinSession>;

/** The bench's mirror, live: on or off, the divergence it waits on, the lag between both twins. */
export const TwinsBenchState = z.object({
  mirror: z.boolean(),
  divergence: z.string().nullable(),
  /** The median time between a gesture on one twin and on the other, in milliseconds; `null` before any. */
  lagMs: z.number().nonnegative().nullable(),
});
export type TwinsBenchState = z.infer<typeof TwinsBenchState>;

/** A gesture of the owner on one twin's screen, in the twin's own pixels (Neko's control events). */
export const TwinGesture = z.discriminatedUnion('event', [
  z.object({
    side: TwinSide,
    event: z.literal('control/move'),
    payload: z.object({
      x: z.number().int().min(0).max(8192),
      y: z.number().int().min(0).max(8192),
    }),
  }),
  z.object({
    side: TwinSide,
    event: z.enum(['control/buttondown', 'control/buttonup']),
    payload: z.object({ code: z.number().int().min(1).max(5) }),
  }),
  z.object({
    side: TwinSide,
    event: z.literal('control/scroll'),
    payload: z.object({
      delta_x: z.number().int().min(-10_000).max(10_000),
      delta_y: z.number().int().min(-10_000).max(10_000),
    }),
  }),
  z.object({
    side: TwinSide,
    event: z.enum(['control/keydown', 'control/keyup']),
    payload: z.object({ keysym: z.number().int().min(1).max(0x10ffffff) }),
  }),
]);
export type TwinGesture = z.infer<typeof TwinGesture>;

export const AcceptanceView = z.object({
  pr: z.number().int().positive(),
  /** The commit judged, and the base it is compared with. */
  head: z.string(),
  base: z.string(),
  criteria: z.array(AcceptanceCriterion),
  checks: z.array(AcceptanceCheck),
  gate: AcceptanceGate.nullable(),
  tests: z.array(AcceptanceTestSuite),
  proofs: z.array(AcceptanceProof),
  /** The review threads, from the oldest; and how many reviews were posted before this head. */
  threads: z.array(AcceptanceThread).default([]),
  reviewRounds: z.number().int().nonnegative().default(0),
  twins: AcceptanceTwins.nullable(),
  /** Why there are no twins: the PR changes no screen, or the project serves no build yet. */
  twinsAbsent: z.enum(['no_screen', 'no_build']).nullable(),
});
export type AcceptanceView = z.infer<typeof AcceptanceView>;

/** The widgets of the recette, in the order the owner listed them (#21). */
export const AcceptanceWidget = z.enum([
  'criteria',
  'checks',
  'tests',
  'proofs',
  'threads',
  'twins',
]);
export type AcceptanceWidget = z.infer<typeof AcceptanceWidget>;

/** The owner's layout of the recette (#22): the order, and the pinned, folded and half-width widgets. */
export const AcceptanceLayout = z.object({
  order: z.array(AcceptanceWidget).max(6),
  pinned: z.array(AcceptanceWidget).max(6),
  collapsed: z.array(AcceptanceWidget).max(6),
  half: z.array(AcceptanceWidget).max(6),
});
export type AcceptanceLayout = z.infer<typeof AcceptanceLayout>;

/** A type of screen: one layout is kept for each, the same for every PR. */
export const AcceptanceDevice = z.enum(['phone', 'desktop']);
export type AcceptanceDevice = z.infer<typeof AcceptanceDevice>;

/** The layout kept for a type of screen; `null` until the owner changes the default one. */
export const AcceptanceLayoutPreference = z.object({
  device: AcceptanceDevice,
  layout: AcceptanceLayout.nullable(),
  updatedAt: Timestamp.nullable(),
});
export type AcceptanceLayoutPreference = z.infer<typeof AcceptanceLayoutPreference>;
