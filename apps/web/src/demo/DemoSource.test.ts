import { IssueDetail, Snapshot } from '@factory-live/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoSource } from './DemoSource.ts';
import { KEYS } from './initial.ts';

describe('DemoSource', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T16:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('respecte les contrats de l’API, au départ comme en fin de scénario', () => {
    const source = new DemoSource();
    expect(() => Snapshot.parse(source.getSnapshot())).not.toThrow();
    vi.advanceTimersByTime(150_000);
    expect(() => Snapshot.parse(source.getSnapshot())).not.toThrow();
    for (const issue of source.getSnapshot().issues) {
      expect(() => IssueDetail.parse(source.getIssueDetail(issue.key))).not.toThrow();
    }
  });

  it('fait avancer les issues sur la ligne', () => {
    const source = new DemoSource();
    const station = (key: string) =>
      source.getSnapshot().issues.find((issue) => issue.key === key)?.station;
    expect(station(KEYS.contact)).toBe('gate');
    expect(station(KEYS.team)).toBe('implementation');
    vi.advanceTimersByTime(25_000);
    expect(station(KEYS.contact)).toBe('release');
    vi.advanceTimersByTime(26_000);
    expect(station(KEYS.team)).toBe('gate');
  });

  it('suit un déblocage : envoyé, pris en compte, carte repartie, puis intervention close', async () => {
    const source = new DemoSource();
    const intervention = () =>
      source.getSnapshot().interventions.find((candidate) => candidate.id === 'iv-projects');

    await source.unblock('iv-projects', 'Option 2');
    expect(intervention()?.unblock?.state).toBe('sent');
    vi.advanceTimersByTime(2_600);
    expect(intervention()?.unblock?.state).toBe('acknowledged');
    vi.advanceTimersByTime(2_500);
    expect(intervention()?.unblock?.state).toBe('resumed');
    vi.advanceTimersByTime(11_000);
    expect(intervention()).toBeUndefined();
  });

  it('notifie ses abonnés à chaque étape et garde la même référence entre deux étapes', () => {
    const source = new DemoSource();
    const listener = vi.fn();
    source.subscribe(listener);
    const before = source.getSnapshot();
    expect(source.getSnapshot()).toBe(before);
    vi.advanceTimersByTime(3_100);
    expect(listener).toHaveBeenCalled();
    expect(source.getSnapshot()).not.toBe(before);
  });
});
