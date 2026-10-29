import { msg } from '@factory-live/contracts';
import { describe, expect, it } from 'vitest';
import { buildHealth } from './health.ts';
import type { HealthSignals } from './health.ts';

const NOW = Date.parse('2026-10-28T18:00:00Z');

function signals(patch: Partial<HealthSignals> = {}): HealthSignals {
  return {
    now: NOW,
    probe: null,
    lastTickAt: null,
    lastHookAt: null,
    hooksPerMinute: 0,
    kanban: { state: 'pending', cards: 0, error: null, readAt: null },
    sessions: { error: null },
    github: {
      configured: false,
      ok: false,
      detail: msg('health.github.noToken'),
      remaining: null,
      limit: null,
      checkedAt: null,
    },
    webhookDeliveries: null,
    providers: new Map(),
    claudeLastSessionAt: null,
    running: 1,
    maxInProgress: 2,
    maxInProgressPerProfile: 1,
    ...patch,
  };
}

const service = (health: ReturnType<typeof buildHealth>, id: string) =>
  health.health.find((item) => item.id === id);

describe('buildHealth', () => {
  it('écrit ce que factory-live observe lui-même en codes, sans une phrase de français', () => {
    const health = buildHealth(
      signals({
        lastTickAt: NOW - 12_000,
        lastHookAt: NOW - 240_000,
        hooksPerMinute: 46,
        kanban: { state: 'read', cards: 12, error: null, readAt: NOW - 300 },
        providers: new Map([
          ['nvidia', { lastOkAt: NOW - 31_000, lastErrorAt: null, rateLimited10m: 0 }],
          ['mistral', { lastOkAt: null, lastErrorAt: null, rateLimited10m: 2 }],
        ]),
      }),
    );
    expect(service(health, 'gateway')).toMatchObject({
      label: msg('health.gateway'),
      status: 'unknown',
      detail: msg('health.gateway.never'),
    });
    expect(service(health, 'dispatcher')).toMatchObject({
      label: msg('health.dispatcher'),
      detail: msg('health.dispatcher.lastTick', { seconds: 12 }),
      metrics: [
        {
          label: msg('health.metric.running'),
          value: msg('health.value.ofTotal', { value: 1, total: 2 }),
        },
        { label: msg('health.metric.perAgent'), value: msg('health.value.atMost', { max: 1 }) },
      ],
    });
    expect(service(health, 'webhook')).toMatchObject({
      label: msg('health.webhook'),
      detail: msg('health.notReported'),
    });
    expect(service(health, 'provider:nvidia')).toMatchObject({
      label: msg('health.nvidia'),
      detail: msg('health.provider.lastOk', { seconds: 31 }),
      metrics: [{ label: msg('health.metric.rateLimited'), value: '0' }],
    });
    expect(service(health, 'provider:mistral')).toMatchObject({
      label: msg('health.provider', { provider: 'mistral' }),
      detail: msg('health.provider.none'),
    });
    expect(service(health, 'probe')?.detail).toEqual(msg('health.probe.none'));
    expect(service(health, 'sources')).toMatchObject({
      label: msg('health.sources'),
      status: 'ok',
      detail: msg('health.sources.detail', {
        kanban: 'read',
        cards: 12,
        kanbanError: null,
        sessionsError: null,
      }),
      metrics: [
        { label: msg('health.metric.hooksPerMinute'), value: '46' },
        { label: msg('health.metric.lastHook'), value: msg('health.value.ago', { seconds: 240 }) },
      ],
    });
  });

  it('garde tels quels les libellés, détails et mesures envoyés par la sonde', () => {
    const report = {
      v: 1 as const,
      probe: 'factory-live-probe' as const,
      at: new Date(NOW).toISOString(),
      gatewayPid: 4242,
      checks: [
        {
          id: 'freellmapi',
          label: 'freellmapi',
          status: 'ok' as const,
          detail: 'Routeur joignable, 14 modèles',
          metrics: { Modèles: '14' },
        },
      ],
    };
    const health = buildHealth(signals({ probe: { report, receivedAt: NOW - 9_000 } }));
    expect(service(health, 'freellmapi')).toMatchObject({
      label: 'freellmapi',
      detail: 'Routeur joignable, 14 modèles',
      metrics: [{ label: 'Modèles', value: '14' }],
    });
    expect(service(health, 'gateway')).toMatchObject({
      status: 'ok',
      detail: msg('health.gateway.running', { seconds: 9 }),
      metrics: [{ label: 'PID', value: '4242' }],
    });
  });

  it('dit pourquoi les sources de factory-live sont en panne', () => {
    const health = buildHealth(
      signals({
        kanban: { state: 'failed', cards: 0, error: 'database is locked', readAt: null },
        sessions: { error: 'state.db illisible' },
      }),
    );
    expect(service(health, 'sources')).toMatchObject({
      status: 'down',
      detail: msg('health.sources.detail', {
        kanban: 'failed',
        cards: 0,
        kanbanError: 'database is locked',
        sessionsError: 'state.db illisible',
      }),
    });
  });
});
