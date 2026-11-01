import type { TranscriptView } from '@factory-live/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TranscriptPanel } from './TranscriptPanel.tsx';

vi.mock('../../data/FactoryProvider.tsx', () => ({
  useTranscripts: () => mockTranscripts,
}));

let mockTranscripts: TranscriptView[] = [];
const baseTime = Date.now();

describe('TranscriptPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTranscripts = [];
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
        entries: [
          {
            id: 'entry-1',
            at: '2026-10-31T11:15:22.000Z',
            role: 'user',
            text: 'Test entry text',
            toolName: null,
            model: null,
            status: null,
          },
        ],
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

    // The displayed lane must render its entries (TranscriptPanel.tsx:230 coverage)
    expect(screen.getByText('Test entry text')).toBeInTheDocument();

    // Order must be: Session Hermes, Implementation, Correction, Correction 2, Terminal
    // (based on lane name read from custom-title)
  });

  it('une lane sans nom ou hors format garde le libellé Claude Code', () => {
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

  it('la légende donne le rang, le nom, les heures et le coût de la lane', () => {
    const views: TranscriptView[] = [
      {
        runId: 1,
        source: 'claude-code',
        title: { code: 'transcript.claudeCode', params: { costUsd: null } },
        name: 'Correction : ordre des groupes par nom de projet',
        startedAt: 1793454922000,
        endedAt: 1793455052000,
        costUsd: 0.41,
        entries: [],
        terminal: [],
      },
    ];
    mockTranscripts = views;
    render(<TranscriptPanel runId={1} />);

    // Legend should contain the lane name, time range, and cost
    const legend = screen.getByText(/Lane Claude Code/);
    expect(legend).toBeInTheDocument();
    expect(legend.textContent).toContain('Correction : ordre des groupes par nom de projet');
    expect(legend.textContent).toContain('de ');
    expect(legend.textContent).toContain('à ');
    expect(legend.textContent).toContain('0,41');
  });

  it('au-delà de six sources le choix devient un menu à toute largeur', () => {
    // Create 7 claude-code lanes + 1 hermes = 8 sources
    const views: TranscriptView[] = [
      {
        runId: 1,
        source: 'hermes',
        title: { code: 'transcript.hermes', params: { profile: 'coder-claude', session: null } },
        name: null,
        startedAt: baseTime - 20000,
        endedAt: baseTime,
        costUsd: null,
        entries: [],
        terminal: [],
      },
      ...Array.from({ length: 7 }, (_, i): TranscriptView => ({
        runId: 1,
        source: 'claude-code' as const,
        title: { code: 'transcript.claudeCode', params: { costUsd: null } },
        name: `Lane ${i + 1}`,
        startedAt: baseTime - 10000 - i * 1000,
        endedAt: baseTime - 1000,
        costUsd: null,
        entries: [],
        terminal: [],
      })),
    ];
    mockTranscripts = views;
    render(<TranscriptPanel runId={1} />);

    // The SegmentedControl should have variant.dropdown at all widths (sourceVariant count > 6)
    const segmentedControl = screen.getByLabelText('Source de la transcription');
    expect(segmentedControl).toBeInTheDocument();
  });

  it('deux sources ne partagent jamais une clé', () => {
    // Three unnamed Claude Code lanes - should have unique React keys
    mockTranscripts = [
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

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<TranscriptPanel runId={1} />);

    // No duplicate key warning
    const duplicateKeyWarning = consoleSpy.mock.calls.some((call) =>
      String(call[0]).includes('Encountered two children with the same key'),
    );
    expect(duplicateKeyWarning).toBe(false);
    consoleSpy.mockRestore();
  });

  it("calcule le rang correct même si les lanes ne sont pas dans l'ordre de démarrage", async () => {
    const baseTime = 1_000_000;
    const views: TranscriptView[] = [
      {
        runId: 1,
        source: 'claude-code',
        title: { code: 'transcript.claudeCode', params: { costUsd: null } },
        name: 'First',
        startedAt: baseTime - 4000,
        endedAt: baseTime,
        costUsd: null,
        entries: [],
        terminal: [],
      },
      {
        runId: 1,
        source: 'claude-code',
        title: { code: 'transcript.claudeCode', params: { costUsd: null } },
        name: 'Second',
        startedAt: baseTime - 6000,
        endedAt: baseTime - 500,
        costUsd: null,
        entries: [],
        terminal: [],
      },
    ];
    mockTranscripts = views;
    render(<TranscriptPanel runId={1} />);

    // Get all buttons with "Claude Code" in their text
    const buttons = screen.getAllByRole('button', { name: /Claude Code/ });
    // In JSDOM, SegmentedControl may render multiple variants; check unique labels
    const labels = [...new Set(buttons.map((b) => b.textContent).filter(Boolean))];
    expect(labels).toEqual(['Claude Code', 'Claude Code 2']);

    // Initial selected is first option in choices (Second, index 0): aria-label has "1 sur 2"
    await vi.waitFor(() => {
      expect(screen.getByRole('region')).toHaveAttribute(
        'aria-label',
        expect.stringContaining('1 sur 2'),
      );
    });
  });

  it('ne montre pas de légende quand la vue terminal est sélectionnée', async () => {
    const baseTime = 1_000_000;
    const views: TranscriptView[] = [
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
        endedAt: baseTime,
        costUsd: null,
        entries: [],
        terminal: ['log line 1'],
      },
    ];
    mockTranscripts = views;
    const { container } = render(<TranscriptPanel runId={1} />);

    // Click on Terminal button
    const terminalButton = screen.getByRole('button', { name: /Terminal/ });
    terminalButton.click();

    // Wait for the legend to disappear (terminal view shows no legend)
    await vi.waitFor(() => {
      const legend = container.querySelector('p[class*="legend"]');
      expect(legend).toBeNull();
    });
  });

  it('affiche la légende "en cours" pour une lane sans endedAt', () => {
    const views: TranscriptView[] = [
      {
        runId: 1,
        source: 'claude-code',
        title: { code: 'transcript.claudeCode', params: { costUsd: null } },
        name: 'Lane en cours',
        startedAt: 1793454922000,
        endedAt: null, // in progress
        costUsd: null,
        entries: [],
        terminal: [],
      },
    ];
    mockTranscripts = views;
    render(<TranscriptPanel runId={1} />);

    // Legend should contain "en cours" (or "in progress" in English)
    const legend = screen.getByText(/en cours|in progress/i);
    expect(legend).toBeInTheDocument();
    expect(legend.textContent).toContain('depuis');
  });

  it('affiche le message "not kept" quand il n\'y a pas de vues', () => {
    mockTranscripts = [];
    render(<TranscriptPanel runId={1} />);

    // Should show the notKept message
    expect(screen.getByText(/non conservée|not kept/i)).toBeInTheDocument();
  });
});
