import { describe, expect, it } from 'vitest';
import { HermesHookBody, ProbeReport } from './ingest.ts';

// Les charges réelles capturées sur Hermès sont vérifiées côté serveur (apps/server/src/ingest).
const body = {
  hook_event_name: 'pre_tool_call',
  profile: 'coder',
  tool_name: 'terminal',
  tool_input: { command: 'npm test' },
  session_id: '20261028_160211_ab12cd',
  cwd: '/home/user/.hermes/kanban/boards/factory/workspaces/t_5e21c0d9',
  extra: { tool_call_id: 'call_1' },
  delivery_id: '649951b5f7824027833bac94c5c89654',
  timestamp: '2026-10-28T17:41:53.546969Z',
};

describe('HermesHookBody', () => {
  it('accepte la forme envoyée par Hermès (microsecondes et Z)', () => {
    expect(HermesHookBody.safeParse(body).success).toBe(true);
  });

  it('refuse un corps sans identifiant de livraison', () => {
    const { delivery_id: _omitted, ...rest } = body;
    expect(HermesHookBody.safeParse(rest).success).toBe(false);
  });
});

describe('ProbeReport', () => {
  it('accepte l’horodatage avec décalage produit par Python (isoformat)', () => {
    const report = {
      v: 1,
      probe: 'factory-live-probe',
      at: '2026-10-28T17:41:53.546969+00:00',
      gatewayPid: 4242,
      checks: [
        {
          id: 'pause',
          label: 'Pause (ESTOP)',
          status: 'ok',
          detail: 'Factory active',
          metrics: {},
        },
      ],
    };
    expect(ProbeReport.parse(report).checks).toHaveLength(1);
  });
});
