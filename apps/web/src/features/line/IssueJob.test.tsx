import type { AgentActivity, Intervention, IssueSummary } from '@factory-live/contracts';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { JobList } from '../../ui/work/JobBox.tsx';
import { IssueJob } from './IssueJob.tsx';

const NOW = Date.parse('2026-10-28T18:00:00Z');
const ISSUE = {
  key: 'claude-cockpit#71',
  repo: 'claude-cockpit',
  number: 71,
  title: 'Vue ÉQUIPE : regrouper les cartes par projet',
  station: 'implementation',
  status: 'active',
  stationChangedAt: new Date(NOW - 38 * 60_000).toISOString(),
  startedAt: new Date(NOW - 3_600_000).toISOString(),
  activeProfiles: ['coder-claude'],
  interventionIds: [],
} as unknown as IssueSummary;
const CODER = {
  profile: 'coder-claude',
  state: 'cli',
  action: {
    kind: 'cli',
    label: 'claude -p',
    detail: 'Edit desktop/src/team/TeamView.tsx',
    startedAt: '',
  },
} as unknown as AgentActivity;

function renderJob(
  patch: Partial<IssueSummary>,
  agent: AgentActivity | null,
  intervention: Intervention | null = null,
  compact = false,
) {
  return render(
    <MemoryRouter>
      <JobList label="Issues">
        <IssueJob
          issue={{ ...ISSUE, ...patch }}
          agent={agent}
          intervention={intervention}
          maxInProgress={2}
          compact={compact}
          now={NOW}
        />
      </JobList>
    </MemoryRouter>,
  );
}

describe('IssueJob', () => {
  it('dit qui travaille sur l’issue et ce qu’il fait, et mène à sa page', () => {
    renderJob({}, CODER);
    expect(screen.getByRole('link', { name: ISSUE.title })).toHaveAttribute(
      'href',
      '/issues/claude-cockpit/71',
    );
    expect(screen.getByText('#71')).toBeInTheDocument();
    expect(screen.getByText('En cours')).toBeInTheDocument();
    expect(screen.getByText('coder-claude')).toBeInTheDocument();
    expect(screen.getByText('claude -p · Edit desktop/src/team/TeamView.tsx')).toBeInTheDocument();
    expect(screen.getByText('38 min')).toBeInTheDocument();
  });

  it('montre la question qui t’attend, avec l’action qui y répond', () => {
    const intervention = {
      id: 'iv-projects',
      kind: 'needs_input',
      title: 'Carte UI sans maquette jointe',
    } as Intervention;
    renderJob({ status: 'waiting_human', interventionIds: ['iv-projects'] }, null, intervention);
    expect(screen.getByText('Attend ta décision')).toBeInTheDocument();
    expect(screen.getByText('Carte UI sans maquette jointe')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Répondre' })).toHaveAttribute(
      'href',
      '/interventions/iv-projects',
    );
  });

  it('propose d’approuver une PR plutôt que de répondre', () => {
    const intervention = {
      id: 'iv-pr',
      kind: 'pr_approval',
      title: 'PR #74 prête',
    } as Intervention;
    renderJob({ status: 'waiting_human' }, null, intervention);
    expect(screen.getByRole('link', { name: 'Approuver la PR' })).toBeInTheDocument();
  });

  it('résume une issue terminée : ni état, ni agent, ni ancienneté', () => {
    renderJob({ status: 'done', station: 'done' }, null, null, true);
    expect(screen.getByRole('link', { name: ISSUE.title })).toBeInTheDocument();
    expect(screen.queryByText('Terminée')).toBeNull();
    expect(screen.queryByText('coder-claude')).toBeNull();
    expect(screen.queryByText(/min$/)).toBeNull();
  });
});
