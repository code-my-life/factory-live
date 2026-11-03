import { render } from '@testing-library/react';
import type { MotionValue } from 'motion/react';
import { useLayoutEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useZoom } from './zoom.tsx';

let scale: MotionValue<number> | null = null;
const keep = (value: MotionValue<number>) => {
  scale = value;
};

function Probe({ width, height }: { width: number; height: number }) {
  const { scroller, scale: value } = useZoom(width, height);
  useLayoutEffect(() => keep(value), [value]);
  return <div ref={scroller} />;
}

describe('useZoom', () => {
  // jsdom lays nothing out: the scroller is 1000 px wide, the window 768 px high (jsdom's default).
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      value: 1000,
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
    scale = null;
  });

  it('refait l’ajustement d’ouverture quand le graphe grandit, tant que personne n’a zoomé', () => {
    const view = render(<Probe width={500} height={300} />);
    expect(scale?.get()).toBe(1);
    // The live page opens on an empty graph, then the first snapshot fills it: twice as wide as the
    // panel, so it fits at half its size.
    view.rerender(<Probe width={2000} height={1200} />);
    expect(scale?.get()).toBeCloseTo(0.5, 5);
  });
});
