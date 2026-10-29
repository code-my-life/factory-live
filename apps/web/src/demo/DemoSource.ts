import { msg } from '@factory-live/contracts';
import type {
  HistoryStats,
  IssueDetail,
  IssueKey,
  ProfileView,
  Snapshot,
  TranscriptView,
  UsageReport,
} from '@factory-live/contracts';
import { ActionError } from '../data/errors.ts';
import type { Connection, FactoryDataSource, UsagePeriod } from '../data/source.ts';
import { CARDS, KEYS } from './initial.ts';
import { createInitialState } from './initial.ts';
import { buildScript } from './script.ts';
import {
  addTimeline,
  closeIntervention,
  iso,
  patchCard,
  patchIntervention,
  patchIssue,
  pushActivity,
} from './state.ts';
import type { DemoState } from './state.ts';

/**
 * Source de démonstration : rejoue un scénario réaliste de la factory, sans serveur.
 * Sert à la maquette publiée en artifact et aux tests de bout en bout.
 */
export class DemoSource implements FactoryDataSource {
  readonly kind = 'demo' as const;
  private state: DemoState;
  private readonly listeners = new Set<() => void>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private readonly clock: () => number;

  constructor(clock: () => number = Date.now) {
    this.clock = clock;
    this.state = createInitialState(this.clock());
    this.schedule();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** La démo ne perd jamais le lien : elle se joue sur l'appareil. */
  getConnection(): Connection {
    return 'open';
  }

  getLastUpdate(): number | null {
    return null;
  }

  getSnapshot(): Snapshot {
    return this.state.snapshot;
  }

  getIssueDetail(key: IssueKey): IssueDetail | null {
    return this.state.details[key] ?? null;
  }

  getTranscripts(runId: number): readonly TranscriptView[] | null {
    return this.state.transcripts[runId] ?? null;
  }

  getProfiles(): readonly ProfileView[] {
    return this.state.profiles;
  }

  getUsage(periodDays: UsagePeriod): UsageReport {
    return this.state.usage[periodDays];
  }

  getHistory(): HistoryStats {
    return this.state.history;
  }

  unblock(interventionId: string, text: string): Promise<void> {
    const intervention = this.state.snapshot.interventions.find(
      (candidate) => candidate.id === interventionId,
    );
    if (!intervention?.issueKey) return Promise.reject(new ActionError('unblockUnknown'));
    const issueKey = intervention.issueKey;
    const commentUrl = `${this.state.details[issueKey]?.issue.url ?? ''}#issuecomment-2471993104`;

    this.update((state, now) => {
      patchIntervention(state, interventionId, {
        unblock: { state: 'sent', text, commentUrl, at: iso(now) },
      });
      pushActivity(state, {
        at: iso(now),
        kind: 'github',
        profile: null,
        issueKey,
        cardId: intervention.cardId,
        label: msg('github.answerPosted', { issueKey }),
        detail: `/factory unblock ${text}`,
        status: 'ok',
        durationMs: null,
        model: null,
      });
      addTimeline(state, issueKey, {
        at: iso(now),
        source: 'factory-live',
        profile: null,
        cardId: intervention.cardId,
        label: msg('unblock.sent'),
        detail: text,
        tone: 'neutral',
      });
    });
    this.later(2.5, (state, now) => {
      patchIntervention(state, interventionId, {
        unblock: { state: 'acknowledged', text, commentUrl, at: iso(now) },
      });
      pushActivity(state, {
        at: iso(now),
        kind: 'github',
        profile: null,
        issueKey,
        cardId: intervention.cardId,
        label: msg('github.answerAcknowledged'),
        detail: null,
        status: 'ok',
        durationMs: null,
        model: null,
      });
    });
    this.later(5, (state, now) => {
      patchIntervention(state, interventionId, {
        unblock: { state: 'resumed', text, commentUrl, at: iso(now) },
      });
      if (intervention.cardId === CARDS.projectsBrief) {
        patchCard(state, KEYS.projects, CARDS.projectsBrief, {
          status: 'ready',
          blockKind: null,
          blockReason: null,
        });
      }
      patchIssue(state, issueKey, { status: 'queued', updatedAt: iso(now) });
      pushActivity(state, {
        at: iso(now),
        kind: 'kanban',
        profile: null,
        issueKey,
        cardId: intervention.cardId,
        label: 'unblocked',
        detail: null,
        status: 'ok',
        durationMs: null,
        model: null,
      });
      addTimeline(state, issueKey, {
        at: iso(now),
        source: 'kanban',
        profile: null,
        cardId: intervention.cardId,
        label: msg('timeline.unblocked'),
        detail: null,
        tone: 'success',
      });
    });
    this.later(16, (state) => closeIntervention(state, interventionId));
    return Promise.resolve();
  }

  restart(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
    this.state = createInitialState(this.clock());
    this.schedule();
    this.emit();
  }

  private schedule(): void {
    for (const step of buildScript()) this.later(step.at, step.run);
  }

  private later(seconds: number, mutate: (state: DemoState, now: number) => void): void {
    this.timers.push(setTimeout(() => this.update(mutate), seconds * 1000));
  }

  private update(mutate: (state: DemoState, now: number) => void): void {
    const now = this.clock();
    const draft = structuredClone(this.state);
    mutate(draft, now);
    draft.snapshot.generatedAt = iso(now);
    this.state = draft;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
