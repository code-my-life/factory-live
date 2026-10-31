import type { TranscriptView } from '@factory-live/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TranscriptPanel } from './TranscriptPanel.tsx';

// Simple text function for tests
const testText = (value: string | { code: string; params: Record<string, unknown> }): string => {
  if (typeof value === 'string') return value;
  // Simple resolution for test message codes
  if (value.code === 'transcript.hermes') {
    const profile = value.params.profile ?? 'unknown';
    const session = value.params.session ? ` (${value.params.session})` : '';
    return `Session Hermès de ${profile}${session}`;
  }
  if (value.code === 'transcript.claudeCode') {
    const cost = value.params.costUsd === null ? '' : ` (${value.params.costUsd} $US)`;
    return `Lane Claude Code${cost}`;
  }
  return value.code;
};

// Mock I18n
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
          tool_call: 'Appel d\'outil',
          tool_result: 'Résultat',
          system: 'Session',
        },
        showAll: (chars: string) => `Afficher en entier (${chars} caractères)`,
        notKept: 'Transcription non conservée',
        rawLog: (runId: number) => `Log brut du run ${runId}`,
        redaction: 'Les secrets sont masqués.',
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

// Mock useTranscripts
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
    // Trois lanes Claude Code sans nom : doivent avoir des libellés distincts
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

    // Le SegmentedControl doit afficher 4 boutons (Hermès + 3 lanes Claude Code)
    const buttons = screen.getAllByRole('button', { name: /Claude Code/ });
    expect(buttons).toHaveLength(3); // Trois lanes "Claude Code" sans nom

    // Les libellés doivent être distincts pour éviter les clés React en double
    const labels = buttons.map((btn) => btn.textContent);
    expect(new Set(labels).size).toBe(3);

    // L'ordre doit être : Session Hermès, Implémentation, Correction, Correction 2, Terminal
    // (selon le nom de la lane lu dans custom-title)
  });
});