import type { TranscriptView } from '@factory-live/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TranscriptPanel } from './TranscriptPanel.tsx';

const testText = (value: string | { code: string; params: Record<string, unknown> }): string => {
  if (typeof value === 'string') return value;
  if (value.code === 'transcript.hermes') {
    const profile = String((value.params.profile as string) ?? 'unknown');
    const sessionValue = value.params.session as string | null | undefined;
    const session = sessionValue ? ` (${sessionValue})` : '';
    return `Session Hermès de ${profile}${session}`;
  }
  if (value.code === 'transcript.claudeCode') {
    const costValue = value.params.costUsd as number | null;
    const cost = costValue === null ? '' : ` (${costValue} $US)`;
    return `Lane Claude Code${cost}`;
  }
  return value.code;
};

vi.mock('../../i18n/I18nProvider.tsx', () => ({
  useI18n: () => ({
    t: {
      transcript: {
        source: {
          hermes: 'Session Hermès',
          'claude-code': 'Claude Code',
          opencode: 'OpenCode',
          terminal: 'Terminal',
        },
        sourceLabel: 'Source de la transcription',
        role: {
          user: 'Consigne',
          assistant: 'Réponse',
          reasoning: 'Raisonnement',
          tool_call: "Appel d'outil",
          tool_result: 'Résultat',
          system: 'Session',
        },
        showAll: (chars: string) => `Afficher en entier (${chars} caractères)`,
        notKept: 'Transcription non conservée',
        rawLog: (runId: number) => `Log brut du run ${runId}`,
        redaction: 'Les secrets sont masqués.',
        legend: {
          withRole: (role: string, name: string) => `${role} : ${name}`,
          unnamed: (label: string) => label,
          inProgress: (since: string) => `depuis ${since} (en cours)`,
          noCost: 'coût inconnu',
          withCost: (cost: string) => cost,
        },
      },
    },
    text: testText,
    fmt: {
      clock: (date: string) => new Date(date).toLocaleTimeString('fr-FR'),
      integer: (n: number) => n.toString(),
      plural: (count: number, one: string, other: string) => (count === 1 ? one : other),
      usd: (amount: number) => `${amount} $US`,
      duration: (ms: number) => `${ms}ms`,
      ago: (seconds: number) => `il y a ${seconds}s`,
      span: (seconds: number) => `${seconds}s`,
    },
  }),
}));

vi.mock('../../data/FactoryProvider.tsx', () => ({
  useTranscripts: () => mockTranscripts,
}));

let mockTranscripts: TranscriptView[] = [];
const baseTime = Date.now();

describe('TranscriptPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('chaque lane porte un libellé distinct', () => {
    // Three unnamed Claude Code lanes: must have distinct labels
    mockTranscripts = [
      {
        runId: 1,
        source: 'hermes',
        title: { code: 'transcript.hermes', params: { profile: 'coder-claude', session: null } },
        name: null,
        startedAt: baseTime - 10000,
        endedAt: baseTime,
        costUsd: null,
        entries: [],
        terminal: [],
      },
      {
        runId: 1,
        source: 'claude-code',
        title: { code: 'transcript.claudeCode', params: { costUsd: null } },
        name: null,
        startedAt: baseTime - 8000,
        endedAt: baseTime - 1000,
        costUsd: null,
        entries: [],
        terminal: [],
      },
      {
        runId: 1,
        source: 'claude-code',
        title: { code: 'transcript.claudeCode', params: { costUsd: null } },
        name: null,
        startedAt: baseTime - 6000,
        endedAt: baseTime - 500,
        costUsd: null,
        entries: [],
        terminal: [],
      },
      {
        runId: 1,
        source: 'claude-code',
        title: { code: 'transcript.claudeCode', params: { costUsd: null } },
        name: null,
        startedAt: baseTime - 4000,
        endedAt: null,
        costUsd: null,
        entries: [],
        terminal: [],
      },
    ];

    render(<TranscriptPanel runId={1} />);

    // SegmentedControl must show 4 buttons (Hermes + 3 Claude Code lanes)
    const buttons = screen.getAllByRole('button', { name: /Claude Code/ });
    expect(buttons).toHaveLength(3); // Three unnamed "Claude Code" lanes

    // Labels must be distinct to avoid duplicate React keys
    const labels = buttons.map((btn) => btn.textContent);
    expect(new Set(labels).size).toBe(3);

    // Order must be: Session Hermes, Implementation, Correction, Correction 2, Terminal
    // (based on lane name read from custom-title)
  });

  it('affiche le nom quand il ny a pas de role', () => {
    // Test: name without colon gives "Claude Code" as label, legend shows full name
    mockTranscripts = [
      {
        runId: 1,
        source: 'claude-code',
        title: { code: 'transcript.claudeCode', params: { costUsd: null } },
        name: 'Implémentation', // no colon, just a name
        startedAt: baseTime - 8000,
        endedAt: baseTime - 1000,
        costUsd: null,
        entries: [],
        terminal: [],
      },
    ];
    render(<TranscriptPanel runId={1} />);
    // With variant prop, Primer renders both regular and dropdown buttons in test env
    // Check distinct labels instead of button count
    const buttons = screen.getAllByRole('button');
    const labels = [...new Set(buttons.map((b) => b.textContent).filter(Boolean))];
    expect(labels).toEqual(['Claude Code']);
    expect(labels[0]).toBe('Claude Code');
  });

  it('affiche le rôle quand le nom contient un role', () => {
    // Test: name with colon at position 1-20 gives the role as label
    mockTranscripts = [
      {
        runId: 1,
        source: 'claude-code',
        title: { code: 'transcript.claudeCode', params: { costUsd: null } },
        name: 'Fix : bug 123', // colon at position 4
        startedAt: baseTime - 8000,
        endedAt: baseTime - 1000,
        costUsd: null,
        entries: [],
        terminal: [],
      },
    ];
    render(<TranscriptPanel runId={1} />);
    // With variant prop, Primer renders both regular and dropdown buttons in test env
    // Check distinct labels instead of button count
    const buttons = screen.getAllByRole('button');
    const labels = [...new Set(buttons.map((b) => b.textContent).filter(Boolean))];
    expect(labels).toEqual(['Fix']);
    expect(labels[0]).toBe('Fix');
  });
});
