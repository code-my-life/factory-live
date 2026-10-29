import type {
  Diagnosis as DiagnosisView,
  Finding as FindingView,
  RunVerdict as RunVerdictView,
} from '@factory-live/contracts';
import {
  branchOf,
  diagnose,
  groupByIssue,
  pullRequestUrl,
  resumeSessionOf,
} from '@factory-live/domain';
import type {
  Board,
  Diagnosis,
  DiagnosisInput,
  Finding,
  FindingCode,
  Intervention,
  Run,
  SessionFacts,
  Task,
  TaskEvent,
} from '@factory-live/domain';
import type {
  AgentLogPort,
  CardFilesPort,
  GitHubReadPort,
  LoggerPort,
  ProfilesPort,
  RunRef,
  SessionsPort,
} from './ports.ts';

/*
 * Le diagnostic des blocages, côté serveur : les faits lus dans les sources d'Hermès (sessions, journal,
 * config de l'agent, code des plugins, preuves) passent aux règles du domaine, et le résultat, mis en
 * cache, rejoint les interventions. Aucun appel réseau ni modèle : des lectures de fichiers locaux.
 */

export interface DiagnosisDeps {
  sessions: Pick<SessionsPort, 'runFacts'>;
  profiles: Pick<ProfilesPort, 'facts' | 'factsStamp'>;
  files: Pick<CardFilesPort, 'evidence' | 'evidenceStamp'>;
  /** `null` tant que le journal d'Hermès n'est pas lu : les règles qui en dépendent restent probables. */
  agentLog: AgentLogPort | null;
  /** Les PR vues sur GitHub, par issue : celle d'une branche dont aucun run n'a noté le lien. */
  pullRequests?: Pick<GitHubReadPort, 'pullRequest'> | null;
  log: LoggerPort;
  boardName: string;
}

/** Les interventions qui s'expliquent : pas une PR à approuver, ni une CI de main rouge. */
export const DIAGNOSED: ReadonlySet<Intervention['kind']> = new Set([
  'needs_input',
  'capability',
  'transient',
  'gave_up',
  'triage_loop',
  'held_active_pr',
]);

/** Les runs relus pour un diagnostic : l'épisode, et ce qui le suit, tiennent dans les derniers. */
const RUNS_READ = 8;
/** Même sans changement visible, un diagnostic se recalcule à ce rythme (journal, durées). */
const SLOT_MS = 15_000;
/** Les épisodes relus pour les verdicts des runs d'une carte. */
const EPISODES_READ = 4;
const VERDICTS_KEPT = 500;
const FAILED = new Set([
  'crashed',
  'blocked',
  'gave_up',
  'timed_out',
  'rate_limited',
  'spawn_failed',
]);
/** Ce qui clôt l'échec d'un run : son propre événement, ou l'abandon noté juste après lui. */
const FAILURE_EVENTS = new Set([
  'blocked',
  'gave_up',
  'block_loop_detected',
  'crashed',
  'timed_out',
  'protocol_violation',
  'spawn_failed',
]);

const isoSeconds = (seconds: number) => new Date(Math.round(seconds * 1000)).toISOString();

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function positive(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

function findingView(finding: Finding): FindingView {
  return {
    code: finding.code,
    confidence: finding.confidence,
    actor: finding.actor,
    cause:
      finding.cause.state === 'fixed'
        ? { ...finding.cause, at: isoSeconds(finding.cause.at) }
        : { ...finding.cause },
    summary: finding.summary,
    why: finding.why,
    subject: { ...finding.subject },
    setting: finding.setting ? { ...finding.setting } : null,
    evidence: finding.evidence.slice(0, 8).map((item) => ({
      source: item.source,
      at: item.at === null ? null : isoSeconds(item.at),
      until: item.until === null ? null : isoSeconds(item.until),
      runId: positive(item.runId),
      fact: item.fact,
      quote: item.quote,
      count: positive(item.count),
    })),
    steps: finding.steps.slice(0, 6).map((step) => ({ ...step })),
    runIds: [...finding.runIds],
  };
}

/** Le diagnostic du domaine (secondes epoch) dans la forme du contrat (dates ISO, listes bornées). */
export function diagnosisView(diagnosis: Diagnosis): DiagnosisView {
  return {
    computedAt: isoSeconds(diagnosis.computedAt),
    episode: { from: isoSeconds(diagnosis.episode.from), runIds: [...diagnosis.episode.runIds] },
    primary: findingView(diagnosis.primary),
    others: diagnosis.others.slice(0, 4).map(findingView),
    unblock: { ...diagnosis.unblock },
    runs: diagnosis.runs.map((verdict) => ({ ...verdict })),
    work: diagnosis.work
      ? {
          ...diagnosis.work,
          evidence: diagnosis.work.evidence
            .slice(0, 50)
            .map((file) => ({ ...file, at: isoSeconds(file.at) })),
        }
      : null,
    sources: { ...diagnosis.sources },
  };
}

/** Le même diagnostic, à l'heure de calcul près : rien de neuf à envoyer aux clients. */
function sameDiagnosis(left: DiagnosisView | null, right: DiagnosisView | null): boolean {
  if (!left || !right) return left === right;
  return (
    JSON.stringify({ ...left, computedAt: null }) === JSON.stringify({ ...right, computedAt: null })
  );
}

/**
 * L'événement qui raconte l'échec d'un run : le dernier des siens, ou celui qu'Hermès note sans run
 * juste après lui (l'abandon du disjoncteur), avant que le run suivant ne commence.
 */
export function anchorOf(
  events: readonly TaskEvent[],
  runs: readonly Run[],
  run: Run,
): number | null {
  const own = events.filter((event) => event.runId === run.id);
  const last = own.at(-1)?.id ?? null;
  const next = runs.find((item) => item.id > run.id);
  const nextStart = next
    ? (events.find((event) => event.runId === next.id)?.id ?? Number.POSITIVE_INFINITY)
    : Number.POSITIVE_INFINITY;
  const told = events.filter(
    (event) =>
      FAILURE_EVENTS.has(event.kind) &&
      (event.runId === run.id ||
        (event.runId === null && last !== null && event.id > last && event.id < nextStart)),
  );
  return told.at(-1)?.id ?? null;
}

export function runRefOf(run: Run): RunRef {
  return {
    id: run.id,
    taskId: run.taskId,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    workerSessionId: text(run.metadata['worker_session_id']),
    resumeSessionId:
      resumeSessionOf(run.error) ?? resumeSessionOf(text(run.metadata['worker_output'])),
  };
}

interface Entry {
  fingerprint: string;
  view: DiagnosisView | null;
  primary: FindingCode | null;
}

/**
 * Calcule et garde le diagnostic de chaque intervention : recalculé quand ses faits changent (carte,
 * runs, config ou plugins de l'agent, preuves), et au moins toutes les 15 s. `refresh` calcule ;
 * `of` ne fait que lire, pour que la projection du tableau reste sans lecture de fichier.
 */
export class DiagnosisService {
  private readonly deps: DiagnosisDeps;
  private readonly entries = new Map<string, Entry>();
  /** Refus et erreurs reçus par webhook depuis le dernier calcul, carte par carte. */
  private readonly touched = new Map<string, number>();
  private readonly verdicts = new Map<
    string,
    { fingerprint: string; runs: Map<number, RunVerdictView> }
  >();

  constructor(deps: DiagnosisDeps) {
    this.deps = deps;
  }

  /** Le diagnostic en cache d'une intervention ; `null` tant qu'il n'est pas calculé, ou sans objet. */
  of(interventionId: string): DiagnosisView | null {
    return this.entries.get(interventionId)?.view ?? null;
  }

  /**
   * Un refus ou une erreur vient de toucher cette carte (webhook) : son diagnostic sera recalculé au
   * prochain `refresh`, sans attendre le créneau suivant. Plusieurs refus d'affilée n'en font qu'un.
   */
  touch(cardId: string): void {
    this.touched.set(cardId, (this.touched.get(cardId) ?? 0) + 1);
  }

  /** La cause principale en cache, pour comparer un blocage au précédent. */
  primaryOf(interventionId: string): FindingCode | null {
    return this.entries.get(interventionId)?.primary ?? null;
  }

  /**
   * Recalcule les diagnostics dont les faits ont changé et oublie ceux des interventions disparues ;
   * vrai si l'un d'eux a changé.
   */
  refresh(board: Board, interventions: readonly Intervention[], nowMs: number): boolean {
    let changed = false;
    const kept = new Set<string>();
    for (const intervention of interventions) {
      if (!DIAGNOSED.has(intervention.kind)) continue;
      const task = board.tasks.find((item) => item.id === intervention.cardId);
      if (!task) continue;
      kept.add(intervention.id);
      const known = this.entries.get(intervention.id);
      const fingerprint = this.fingerprint(board, task, intervention, nowMs);
      if (known?.fingerprint === fingerprint) continue;
      const diagnosis = this.compute(board, task, intervention.eventId, nowMs);
      const view = diagnosis ? diagnosisView(diagnosis) : null;
      // Les lectures de `compute` complètent l'empreinte (fichiers des plugins) : on la reprend après.
      const entry: Entry = {
        fingerprint: this.fingerprint(board, task, intervention, nowMs),
        view: known && sameDiagnosis(known.view, view) ? known.view : view,
        primary: diagnosis?.primary.code ?? null,
      };
      if (entry.view !== known?.view) changed = true;
      this.entries.set(intervention.id, entry);
    }
    for (const id of this.entries.keys()) {
      if (!kept.has(id)) {
        this.entries.delete(id);
        changed = true;
      }
    }
    return changed;
  }

  /**
   * Le verdict de chaque run en échec d'une carte, pour la page d'une issue : du plus récent au plus
   * ancien, chaque run sans verdict fait relire son épisode, quatre au plus.
   */
  verdictsOf(board: Board, task: Task, nowMs: number): ReadonlyMap<number, RunVerdictView> {
    const runs = this.runsOf(board, task);
    const failed = runs.filter((run) => run.outcome !== null && FAILED.has(run.outcome));
    if (failed.length === 0) return new Map();
    const fingerprint = this.cardFingerprint(board, task);
    const known = this.verdicts.get(task.id);
    if (known?.fingerprint === fingerprint) return known.runs;
    const events = this.eventsOf(board, task);
    const found = new Map<number, RunVerdictView>();
    let read = 0;
    for (const run of failed.reverse()) {
      if (found.has(run.id)) continue;
      if (read >= EPISODES_READ) break;
      read += 1;
      const diagnosis = this.compute(board, task, anchorOf(events, runs, run), nowMs);
      for (const verdict of diagnosis?.runs ?? [])
        if (!found.has(verdict.runId)) found.set(verdict.runId, { ...verdict });
    }
    // Une entrée par carte consultée : le cache se vide plutôt que de grossir sans fin.
    if (this.verdicts.size >= VERDICTS_KEPT) this.verdicts.clear();
    this.verdicts.set(task.id, { fingerprint: this.cardFingerprint(board, task), runs: found });
    return found;
  }

  private eventsOf(board: Board, task: Task): TaskEvent[] {
    return board.events
      .filter((event) => event.taskId === task.id)
      .sort((left, right) => left.id - right.id);
  }

  private runsOf(board: Board, task: Task): Run[] {
    return board.runs
      .filter((run) => run.taskId === task.id)
      .sort((left, right) => left.id - right.id);
  }

  /** L'agent dont la config et le journal comptent : celui du dernier run relu, sinon l'assigné. */
  private profileOf(board: Board, task: Task): string | null {
    return this.runsOf(board, task).at(-1)?.profile ?? task.assignee;
  }

  private cardFingerprint(board: Board, task: Task): string {
    const runs = this.runsOf(board, task).slice(-RUNS_READ);
    const profile = this.profileOf(board, task);
    return JSON.stringify([
      task.status,
      task.blockKind,
      task.currentRunId,
      task.consecutiveFailures,
      task.blockRecurrences,
      task.lastHeartbeatAt,
      task.branchName,
      board.events.filter((event) => event.taskId === task.id).at(-1)?.id ?? null,
      runs.map((run) => `${run.id}:${run.status}:${run.outcome ?? ''}:${run.endedAt ?? ''}`),
      profile ? this.safe(() => this.deps.profiles.factsStamp(profile), '-') : '-',
      this.safe(() => this.deps.files.evidenceStamp(task.id), '-'),
      this.touched.get(task.id) ?? 0,
    ]);
  }

  private fingerprint(board: Board, task: Task, intervention: Intervention, nowMs: number): string {
    return `${this.cardFingerprint(board, task)}|${intervention.eventId ?? ''}|${Math.floor(nowMs / SLOT_MS)}`;
  }

  private safe<T>(read: () => T, fallback: T): T {
    try {
      return read();
    } catch (error) {
      this.deps.log.debug({ component: 'diagnosis', error: String(error) }, 'source illisible');
      return fallback;
    }
  }

  /** La PR de l'issue de la carte, telle que GitHub la connaît (retrouvée par sa branche au besoin). */
  private issuePullRequest(board: Board, task: Task): string | null {
    const pullRequests = this.deps.pullRequests;
    if (!pullRequests) return null;
    for (const [key, tasks] of groupByIssue(board))
      if (tasks.some((item) => item.id === task.id))
        return this.safe(() => pullRequests.pullRequest(key)?.url ?? null, null);
    return null;
  }

  private sessionsOf(runs: readonly Run[]): SessionFacts[] | null {
    const byProfile = new Map<string, RunRef[]>();
    for (const run of runs)
      byProfile.set(run.profile, [...(byProfile.get(run.profile) ?? []), runRefOf(run)]);
    let readable = false;
    const sessions: SessionFacts[] = [];
    for (const [profile, refs] of byProfile) {
      const facts = this.safe(() => this.deps.sessions.runFacts(profile, refs), null);
      if (facts === null) continue;
      readable = true;
      sessions.push(...facts);
    }
    return readable || runs.length === 0 ? sessions : null;
  }

  private compute(
    board: Board,
    task: Task,
    anchorId: number | null,
    nowMs: number,
  ): Diagnosis | null {
    const now = nowMs / 1000;
    const runs = this.runsOf(board, task);
    const events = this.eventsOf(board, task);
    const anchor =
      anchorId === null ? null : (events.find((event) => event.id === anchorId) ?? null);
    const read = runs.slice(-RUNS_READ);
    const profile =
      (anchor?.runId ? runs.find((run) => run.id === anchor.runId)?.profile : undefined) ??
      this.profileOf(board, task);
    const from = read[0]?.startedAt ?? task.createdAt;
    const agentLog = this.deps.agentLog;
    const input: DiagnosisInput = {
      now,
      board: this.deps.boardName,
      task,
      runs,
      events,
      anchor,
      sessions: this.sessionsOf(read),
      logs:
        profile && agentLog ? this.safe(() => agentLog.facts(profile, from - 60, now), null) : null,
      profile: profile ? this.safe(() => this.deps.profiles.facts(profile), null) : null,
      evidence: this.safe(() => this.deps.files.evidence(task.id), null),
      branch: branchOf(task, runs),
      prUrl: pullRequestUrl([task], board) ?? this.issuePullRequest(board, task),
      owner: task.assignee,
    };
    try {
      return diagnose(input);
    } catch (error) {
      this.deps.log.error(
        { component: 'diagnosis', card: task.id, error: String(error) },
        'diagnostic en échec',
      );
      return null;
    }
  }
}
