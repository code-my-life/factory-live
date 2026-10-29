import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StationMark } from './StationMark.tsx';

describe('StationMark', () => {
  it('nomme la station derrière son arrêt rond, décoratif', () => {
    const { container } = render(<StationMark station="implementation" />);
    expect(screen.getByText('Implémentation')).toBeInTheDocument();
    const stop = container.querySelector('[aria-hidden="true"]');
    expect(stop?.querySelector('svg')).not.toBeNull();
    expect(container).toHaveTextContent(/^Implémentation$/);
  });

  it('accepte un libellé fait de la station (« Étape : Brief »)', () => {
    render(<StationMark station="brief" label="Étape : Brief" />);
    expect(screen.getByText('Étape : Brief')).toBeInTheDocument();
  });
});
