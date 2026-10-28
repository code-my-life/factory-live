import type { IssueSummary } from '@factory-live/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PullRequestPanel } from './PullRequestPanel.tsx';

const issue = (patch: Partial<IssueSummary>) =>
  ({ key: 'claude-cockpit#18', pr: null, prUrl: null, ...patch }) as IssueSummary;

describe('PullRequestPanel', () => {
  it('donne la PR relevée par la factory tant que GitHub n’est pas relié, sans inventer son état', () => {
    render(
      <PullRequestPanel
        issue={issue({ prUrl: 'https://github.com/code-my-life/claude-cockpit/pull/62' })}
      />,
    );
    expect(screen.getByRole('link', { name: '#62' })).toHaveAttribute(
      'href',
      'https://github.com/code-my-life/claude-cockpit/pull/62',
    );
    expect(screen.getByText(/une fois GitHub relié/)).toBeInTheDocument();
  });

  it('dit qu’il n’y a pas encore de PR quand la factory n’en a noté aucune', () => {
    render(<PullRequestPanel issue={issue({})} />);
    expect(screen.getByText(/Pas encore de PR/)).toBeInTheDocument();
  });
});
