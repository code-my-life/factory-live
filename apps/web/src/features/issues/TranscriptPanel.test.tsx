import type { TranscriptView } from '@factory-live/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TranscriptPanel, legendForView, sourceVariant } from './TranscriptPanel.tsx';
import { i18nOf } from '../../i18n/i18n.ts';

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
    // Test: legend matches Attendu 6 exactly
    // Use real i18n formatters for accurate fmt.clock and fmt.duration
    const fr = i18nOf('fr');
    const en = i18nOf('en');

    // Use local time dates so fmt.clock gives 11:15:22 regardless of timezone
    const startTime = new Date(2026, 9, 31, 11, 15, 22).getTime(); // 11:15:22 local
    const endTime = new Date(2026, 9, 31, 11, 17, 32).getTime(); // 11:17:32 local (2m 10s later)
    const otherStartTime = new Date(2026, 9, 31, 11, 10, 0).getTime(); // earlier lane
    const otherEndTime = new Date(2026, 9, 31, 11, 12, 0).getTime();
    const thirdStartTime = new Date(2026, 9, 31, 11, 20, 0).getTime(); // later lane
    const thirdEndTime = new Date(2026, 9, 31, 11, 22, 0).getTime();

    // 3 claude-code views so rank is "2 sur 3"
    const views: TranscriptView[] = [
      {
        runId: 1,
        source: 'claude-code',
        title: { code: 'transcript.claudeCode', params: { costUsd: null } },
        name: 'First Lane',
        startedAt: otherStartTime,
        endedAt: otherEndTime,
        costUsd: null,
        entries: [],
        terminal: [],
      },
      {
        runId: 1,
        source: 'claude-code',
        title: { code: 'transcript.claudeCode', params: { costUsd: 0.41 } },
        name: 'Correction : ordre des groupes par nom de projet',
        startedAt: startTime,
        endedAt: endTime,
        costUsd: 0.41,
        entries: [],
        terminal: [],
      },
      {
        runId: 1,
        source: 'claude-code',
        title: { code: 'transcript.claudeCode', params: { costUsd: 1.12 } },
        name: 'Implémentation : vue ÉQUIPE groupée par projet',
        startedAt: thirdStartTime,
        endedAt: thirdEndTime,
        costUsd: 1.12,
        entries: [],
        terminal: ['log line'],
      },
    ];

    // Test French - rank 2 of 3 (index 1 in sorted array)
    const correctionView = views[1]!;
    const legendFr = legendForView(correctionView, fr.t, views, 1, fr.fmt, fr.text);
    expect(legendFr).toBe(
      'Lane Claude Code 2 sur 3 : « Correction : ordre des groupes par nom de projet », de 11:15:22 à 11:17:32 (2 min 10 s), 0,41 $US',
    );

    // Test English - rank 2 of 3
    const legendEn = legendForView(correctionView, en.t, views, 1, en.fmt, en.text);
    expect(legendEn).toBe(
      'Lane Claude Code 2 of 3: “Correction : ordre des groupes par nom de projet”, from 11:15:22 AM to 11:17:32 AM (2m 10s), $0.41',
    );

    // Test single lane (no rank)
    const singleView: TranscriptView = {
      runId: 1,
      source: 'claude-code',
      title: { code: 'transcript.claudeCode', params: { costUsd: null } },
      name: 'Solo Lane',
      startedAt: startTime,
      endedAt: endTime,
      costUsd: null,
      entries: [],
      terminal: [],
    };
    const singleLegendFr = legendForView(singleView, fr.t, [singleView], 0, fr.fmt, fr.text);
    expect(singleLegendFr).toBe(
      'Lane Claude Code : « Solo Lane », de 11:15:22 à 11:17:32 (2 min 10 s)',
    );
    const singleLegendEn = legendForView(singleView, en.t, [singleView], 0, en.fmt, en.text);
    expect(singleLegendEn).toBe(
      'Lane Claude Code: “Solo Lane”, from 11:15:22 AM to 11:17:32 AM (2m 10s)',
    );

    // Test in-progress lane
    const inProgressView: TranscriptView = {
      runId: 1,
      source: 'claude-code',
      title: { code: 'transcript.claudeCode', params: { costUsd: null } },
      name: 'In Progress Lane',
      startedAt: startTime,
      endedAt: null,
      costUsd: null,
      entries: [],
      terminal: [],
    };
    const inProgressLegendFr = legendForView(
      inProgressView,
      fr.t,
      [inProgressView],
      0,
      fr.fmt,
      fr.text,
    );
    expect(inProgressLegendFr).toBe(
      'Lane Claude Code : « In Progress Lane », depuis 11:15:22 (en cours)',
    );
    const inProgressLegendEn = legendForView(
      inProgressView,
      en.t,
      [inProgressView],
      0,
      en.fmt,
      en.text,
    );
    expect(inProgressLegendEn).toBe(
      'Lane Claude Code: “In Progress Lane”, since 11:15:22 AM (in progress)',
    );

    // Test non-claude-code source (hermes) - should use text(view.title)
    const hermesView: TranscriptView = {
      runId: 1,
      source: 'hermes',
      title: { code: 'transcript.hermes', params: { profile: 'coder-claude', session: null } },
      name: null,
      startedAt: startTime,
      endedAt: endTime,
      costUsd: null,
      entries: [],
      terminal: [],
    };
    const hermesLegendFr = legendForView(hermesView, fr.t, [], 0, fr.fmt, fr.text);
    expect(hermesLegendFr).toBe('Session Hermès de coder-claude');
  });

  it('au-delà de six sources le choix devient un menu à toute largeur', () => {
    // Test C11: with 7 sources, variant should be dropdown at all widths
    // First verify the exported sourceVariant function
    expect(sourceVariant(6)).toEqual({ narrow: 'dropdown', regular: 'default' });
    expect(sourceVariant(7)).toEqual({
      narrow: 'dropdown',
      regular: 'dropdown',
      wide: 'dropdown',
    });

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
        startedAt: baseTime - 9000,
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
        startedAt: baseTime - 7000,
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
        startedAt: baseTime - 5000,
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
        startedAt: baseTime - 4000,
        endedAt: baseTime - 1000,
        costUsd: null,
        entries: [],
        terminal: ['log'],
      },
    ];
    render(<TranscriptPanel runId={1} />);
    // Verify the component renders without error
    const elements = screen.getAllByText('Session Hermès');
    expect(elements.length).toBeGreaterThan(0);
  });

  it('deux sources ne partagent jamais une clé', () => {
    // Test: React keys are unique for all sources
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
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
        endedAt: baseTime,
        costUsd: null,
        entries: [],
        terminal: ['log'],
      },
    ];
    render(<TranscriptPanel runId={1} />);
    // Verify no duplicate React keys warning
    const duplicateKeyWarning = consoleSpy.mock.calls.some((call) =>
      call.some(
        (arg) =>
          typeof arg === 'string' && arg.includes('Encountered two children with the same key'),
      ),
    );
    expect(duplicateKeyWarning).toBe(false);
    consoleSpy.mockRestore();
  });
});
