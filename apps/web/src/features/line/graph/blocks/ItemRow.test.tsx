import type { IssueSummary } from '@factory-live/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../../i18n/I18nProvider.tsx';
import { ItemRow } from './ItemRow.tsx';

beforeEach(() => localStorage.setItem('factory-live:locale', 'fr'));
afterEach(() => localStorage.clear());

const ISSUE: IssueSummary = {
  key: 'video-factory#12',
  repo: 'video-factory',
  number: 12,
  title: 'Présenter la ligne d’usine en une minute',
  url: 'https://github.com/code-my-life/video-factory/issues/12',
  labels: [],
  station: 'implementation',
  previousStation: null,
  stationChangedAt: '2026-11-05T10:40:00Z',
  status: 'active',
  claudeModel: null,
  harness: null,
  pr: null,
  prUrl: null,
  activeProfiles: [],
  interventionIds: [],
  startedAt: '2026-11-05T09:00:00Z',
  updatedAt: '2026-11-05T11:00:00Z',
  type: null,
  lane: null,
  journey: [],
};

describe('ItemRow', () => {
  it('le titre d’une ligne ouvre son élément, désigné par sa clé', () => {
    const onSelect = vi.fn();
    render(
      <I18nProvider>
        <ItemRow
          item={{ issue: ISSUE, box: 'implementation', agent: null, intervention: null }}
          row="full"
          ai
          selected={false}
          arriving={false}
          landed={false}
          dimmed={false}
          onSelect={onSelect}
          now={Date.parse('2026-11-05T12:00:00Z')}
          maxInProgress={2}
        />
      </I18nProvider>,
    );
    const title = screen.getByRole('button', { name: ISSUE.title });
    expect(title).toHaveAttribute('aria-pressed', 'false');
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(title);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('video-factory#12');
  });
});
