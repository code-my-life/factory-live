import type { AgentActivity, CardView, IssueSummary } from '@factory-live/contracts';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fr } from '../../i18n/fr.ts';
import {
  WorkStateIcon,
  WorkStateLabel,
  cardWorkState,
  interventionTone,
  issueWorkState,
} from './workState.tsx';

const issue = (status: IssueSummary['status']) => ({ status }) as IssueSummary;
const card = (status: CardView['status']) => ({ status }) as CardView;
const agent = (state: AgentActivity['state']) => ({ state }) as AgentActivity;

describe('issueWorkState', () => {
  it('ne fait tourner l’icône que si un agent travaille vraiment sur l’issue', () => {
    expect(issueWorkState(issue('active'), agent('cli'), fr)).toMatchObject({
      label: 'En cours',
      tone: 'accent',
      working: true,
    });
    expect(issueWorkState(issue('active'), agent('queued'), fr).working).toBe(false);
    expect(issueWorkState(issue('active'), null, fr).working).toBe(false);
  });

  it('nomme et colore ce qui t’attend, ce qui bloque, ce qui patiente, ce qui est fini', () => {
    expect(issueWorkState(issue('waiting_human'), null, fr)).toMatchObject({
      label: 'Attend ta décision',
      tone: 'attention',
    });
    expect(issueWorkState(issue('blocked'), agent('blocked'), fr)).toMatchObject({
      label: 'Bloquée',
      tone: 'danger',
      working: false,
    });
    expect(issueWorkState(issue('queued'), null, fr).tone).toBe('secondary');
    expect(issueWorkState(issue('done'), null, fr).tone).toBe('done');
  });
});

describe('cardWorkState', () => {
  it('suit l’état de la carte : en cours, bloquée, triage, faite', () => {
    expect(cardWorkState(card('running'), agent('tool'), fr)).toMatchObject({
      working: true,
      tone: 'accent',
    });
    expect(cardWorkState(card('blocked'), null, fr).tone).toBe('danger');
    expect(cardWorkState(card('triage'), null, fr).tone).toBe('attention');
    expect(cardWorkState(card('done'), null, fr)).toMatchObject({
      label: 'Terminée',
      tone: 'done',
    });
  });

  it('« Terminée » a la même couleur pour une carte que pour une issue', () => {
    expect(cardWorkState(card('done'), null, fr).tone).toBe(
      issueWorkState(issue('done'), null, fr).tone,
    );
  });

  it('une carte en revue se lit comme un travail en cours, pas comme une carte finie', () => {
    expect(cardWorkState(card('review'), null, fr).tone).toBe('accent');
    expect(cardWorkState(card('review'), null, fr).tone).not.toBe(
      cardWorkState(card('done'), null, fr).tone,
    );
  });
});

describe('interventionTone', () => {
  it('une intervention a la couleur de sa gravité : rouge quand elle bloque, jaune sinon', () => {
    expect(interventionTone({ severity: 'critical' })).toBe('danger');
    expect(interventionTone({ severity: 'warning' })).toBe('attention');
    expect(interventionTone({ severity: 'info' })).toBe('attention');
  });
});

describe('WorkStateIcon', () => {
  it('montre le Spinner de Primer, en boucle coupable, quand un agent travaille', () => {
    const { container } = render(
      <WorkStateIcon state={issueWorkState(issue('active'), agent('thinking'), fr)} />,
    );
    expect(container.querySelector('[data-component="Spinner"] svg')).toHaveAttribute('data-loop');
  });

  it('montre l’octicon de l’état, décorative, sinon', () => {
    const { container } = render(
      <WorkStateIcon state={issueWorkState(issue('blocked'), null, fr)} />,
    );
    expect(container.querySelector('[data-component="Spinner"]')).toBeNull();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstElementChild).toHaveAttribute('data-tone', 'danger');
  });
});

describe('WorkStateLabel', () => {
  it('peint l’état de la couleur franche de son rôle, avec son icône', () => {
    const { getByText } = render(
      <WorkStateLabel state={issueWorkState(issue('blocked'), null, fr)} />,
    );
    const label = getByText('Bloquée').closest('[data-solid]');
    expect(label).toHaveAttribute('data-variant', 'danger');
    expect(label?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('se passe de l’icône quand la boîte du job la montre déjà', () => {
    const { getByText } = render(
      <WorkStateLabel state={cardWorkState(card('running'), null, fr)} icon={false} />,
    );
    expect(getByText('En cours').closest('[data-solid]')?.querySelector('svg')).toBeNull();
  });
});
