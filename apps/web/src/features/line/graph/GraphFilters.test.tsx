import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../../../i18n/I18nProvider.tsx';
import { GraphFilters, NO_FILTERS } from './filters.tsx';

describe('GraphFilters', () => {
  it('le filtre Type propose Skill, sous son nom', async () => {
    render(
      <I18nProvider>
        <GraphFilters items={[]} filters={NO_FILTERS} onChange={() => undefined} found={null} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Type/ }));
    const types = await screen.findByRole('menu', { name: 'Type' });
    expect(within(types).getByText('Skill')).toBeInTheDocument();
  });
});
