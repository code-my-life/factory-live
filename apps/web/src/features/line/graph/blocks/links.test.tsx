import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BranchLink, FanLink, LineLink, ReturnArch } from './links.tsx';

const strokes = (elements: NodeListOf<Element>) =>
  [...elements].map((element) => (element as SVGElement).style.stroke);

describe('Link', () => {
  it('un lien au repos dessine sa courbe et ses deux ports, à leurs extrémités, sans surcouche', () => {
    render(<LineLink color="rgb(1, 2, 3)" label="Ligne : Au repos" />);
    const svg = screen.getByRole('img', { name: 'Ligne : Au repos' });
    expect(svg).toHaveAttribute('data-link', 'line');
    expect(svg).not.toHaveAttribute('data-active');
    expect(svg).not.toHaveAttribute('data-cause');
    expect(svg.querySelectorAll('path')).toHaveLength(1);
    const ports = [...svg.querySelectorAll('circle')].map((port) => [
      port.getAttribute('cx'),
      port.getAttribute('cy'),
    ]);
    expect(ports).toEqual([
      ['8', '32'],
      ['152', '32'],
    ]);
    expect(strokes(svg.querySelectorAll('circle'))).toEqual(['rgb(1, 2, 3)', 'rgb(1, 2, 3)']);
  });

  it('en activité, chaque courbe a sa surcouche, et ses ports la couleur de sa marque', () => {
    render(
      <ReturnArch
        color="rgb(1, 2, 3)"
        mark="rgb(200, 0, 0)"
        dash="7 5"
        active
        cause="problem"
        label="Retour : Pris après un échec"
      />,
    );
    const svg = screen.getByRole('img', { name: 'Retour : Pris après un échec' });
    expect(svg).toHaveAttribute('data-link', 'return');
    expect(svg).toHaveAttribute('data-active', '');
    expect(svg).toHaveAttribute('data-cause', 'problem');
    const paths = svg.querySelectorAll('path');
    expect(paths).toHaveLength(2);
    expect(strokes(paths)).toEqual(['rgb(1, 2, 3)', 'rgb(200, 0, 0)']);
    for (const path of paths) expect(path).toHaveAttribute('stroke-dasharray', '7 5');
    const ports = svg.querySelectorAll('circle');
    expect([...ports].map((port) => port.getAttribute('cx'))).toEqual(['140', '20']);
    expect(strokes(ports)).toEqual(['rgb(200, 0, 0)', 'rgb(200, 0, 0)']);
    for (const port of ports) expect(port).toHaveAttribute('data-active', '');
  });

  it('en activité sans marque, la surcouche et les ports gardent la couleur du lien', () => {
    render(<BranchLink color="rgb(1, 2, 3)" active label="Branche : En activité" />);
    const svg = screen.getByRole('img', { name: 'Branche : En activité' });
    expect(strokes(svg.querySelectorAll('path'))).toEqual(['rgb(1, 2, 3)', 'rgb(1, 2, 3)']);
    const ports = [...svg.querySelectorAll('circle')].map((port) => [
      port.getAttribute('cx'),
      port.getAttribute('cy'),
    ]);
    expect(ports).toEqual([
      ['12', '6'],
      ['152', '52'],
    ]);
    expect(strokes(svg.querySelectorAll('circle'))).toEqual(['rgb(1, 2, 3)', 'rgb(1, 2, 3)']);
  });

  it('un éventail dessine une courbe et deux ports par membre', () => {
    render(<FanLink color="rgb(1, 2, 3)" active label="Éventail : En activité" />);
    const svg = screen.getByRole('img', { name: 'Éventail : En activité' });
    expect(svg.querySelectorAll('path')).toHaveLength(6);
    expect(svg.querySelectorAll('circle')).toHaveLength(6);
  });
});
