import type { AgentActivity, CardView, IssueSummary } from '@factory-live/contracts';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkStateIcon, cardWorkState, issueWorkState } from './workState.tsx';

const issue = (status: IssueSummary['status']) => ({ status }) as IssueSummary;
const card = (status: CardView['status']) => ({ status }) as CardView;
const agent = (state: AgentActivity['state']) => ({ state }) as AgentActivity;

describe('issueWorkState', () => {
  it('ne fait tourner l’icône que si un agent travaille vraiment sur l’issue', () => {
    expect(issueWorkState(issue('active'), agent('cli'))).toMatchObject({
      label: 'En cours',
      tone: 'accent',
      working: true,
    });
    expect(issueWorkState(issue('active'), agent('queued')).working).toBe(false);
    expect(issueWorkState(issue('active'), null).working).toBe(false);
  });

  it('nomme et colore ce qui t’attend, ce qui bloque, ce qui patiente, ce qui est fini', () => {
    expect(issueWorkState(issue('waiting_human'), null)).toMatchObject({
      label: 'Attend ta décision',
      tone: 'attention',
    });
    expect(issueWorkState(issue('blocked'), agent('blocked'))).toMatchObject({
      label: 'Bloquée',
      tone: 'danger',
      working: false,
    });
    expect(issueWorkState(issue('queued'), null).tone).toBe('secondary');
    expect(issueWorkState(issue('done'), null).tone).toBe('done');
  });
});

describe('cardWorkState', () => {
  it('suit l’état de la carte : en cours, bloquée, triage, faite', () => {
    expect(cardWorkState(card('running'), agent('tool'))).toMatchObject({
      working: true,
      tone: 'accent',
    });
    expect(cardWorkState(card('blocked'), null).tone).toBe('danger');
    expect(cardWorkState(card('triage'), null).tone).toBe('attention');
    expect(cardWorkState(card('done'), null)).toMatchObject({ label: 'Terminée', tone: 'success' });
  });
});

describe('WorkStateIcon', () => {
  it('montre le Spinner de Primer, en boucle coupable, quand un agent travaille', () => {
    const { container } = render(
      <WorkStateIcon state={issueWorkState(issue('active'), agent('thinking'))} />,
    );
    expect(container.querySelector('[data-component="Spinner"] svg')).toHaveAttribute('data-loop');
  });

  it('montre l’octicon de l’état, décorative, sinon', () => {
    const { container } = render(<WorkStateIcon state={issueWorkState(issue('blocked'), null)} />);
    expect(container.querySelector('[data-component="Spinner"]')).toBeNull();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstElementChild).toHaveAttribute('data-tone', 'danger');
  });
});
