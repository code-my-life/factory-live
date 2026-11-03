import { ScreenFullIcon, ZoomInIcon, ZoomOutIcon } from '@primer/octicons-react';
import { IconButton } from '@primer/react';
import { animate, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import type { MotionValue } from 'motion/react';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { MAX_SCALE, MIN_SCALE } from './layout.ts';
import styles from './graph.module.css';

export interface Zoom {
  scroller: RefObject<HTMLDivElement | null>;
  scale: MotionValue<number>;
  width: MotionValue<number>;
  height: MotionValue<number>;
  zoomBy: (factor: number) => void;
  fit: () => void;
  /** Pans the graph, without zooming, so that the span from `x` over `w` (graph px) is in view. */
  reveal: (x: number, w: number) => void;
}

/** Room kept under the fitted graph: the bar of the legend and the zoom. */
const FIT_FOOT = 56;

/**
 * The graph's zoom: two fingers on a phone, the buttons or Ctrl and the wheel on a computer. The
 * point under the fingers (or the centre of the view) stays put while the scale changes; one finger
 * still scrolls the page and the graph natively. The page opens on the whole factory, and keeps
 * showing it when the window or the graph changes size, until the owner zooms.
 */
export function useZoom(contentWidth: number, contentHeight: number): Zoom {
  const scroller = useRef<HTMLDivElement | null>(null);
  const reduce = useReducedMotion();
  const scale = useMotionValue(1);
  const widthBase = useMotionValue(contentWidth);
  const heightBase = useMotionValue(contentHeight);
  useLayoutEffect(() => {
    widthBase.set(contentWidth);
    heightBase.set(contentHeight);
  }, [contentWidth, contentHeight, widthBase, heightBase]);
  const width = useTransform(() => widthBase.get() * scale.get());
  const height = useTransform(() => heightBase.get() * scale.get());

  const zoomed = useRef(false);
  const actions = useMemo(() => {
    const clamp = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
    /** The scale that shows the whole graph: as wide as the panel, as tall as the window under it. */
    const fitScale = () => {
      const element = scroller.current;
      if (!element) return 1;
      const top = element.getBoundingClientRect().top + window.scrollY;
      const room = window.innerHeight - Math.min(top, window.innerHeight / 2) - FIT_FOOT;
      return clamp(Math.min(1, element.clientWidth / widthBase.get(), room / heightBase.get()));
    };
    /** Sets the scale keeping the content point under (x, y), in viewport pixels, where it is. */
    const setScale = (next: number, x: number, y: number) => {
      const element = scroller.current;
      if (!element) return;
      const before = scale.get();
      const contentX = (element.scrollLeft + x) / before;
      const contentY = (element.scrollTop + y) / before;
      scale.set(next);
      element.scrollLeft = contentX * next - x;
      element.scrollTop = contentY * next - y;
    };
    // `animate` on a plain value ignores the reduced-motion setting: the zoom then jumps.
    const glide = (to: number, x: number, y: number) => {
      if (reduce) {
        setScale(to, x, y);
        return;
      }
      animate(scale.get(), to, {
        type: 'spring',
        bounce: 0,
        visualDuration: 0.3,
        onUpdate: (value) => setScale(value, x, y),
      });
    };
    return {
      clamp,
      fitScale,
      setScale,
      zoomBy: (factor: number) => {
        const element = scroller.current;
        if (!element) return;
        zoomed.current = true;
        glide(clamp(scale.get() * factor), element.clientWidth / 2, element.clientHeight / 2);
      },
      // Back to the whole line, and to following the window again.
      fit: () => {
        zoomed.current = false;
        glide(fitScale(), 0, 0);
      },
      reveal: (x: number, w: number) => {
        const element = scroller.current;
        if (!element) return;
        const current = scale.get();
        const left = element.scrollLeft / current;
        const right = left + element.clientWidth / current;
        if (x >= left && x + w <= right) return;
        element.scrollLeft = Math.max(0, (x + w / 2) * current - element.clientWidth / 2);
      },
    };
  }, [scale, widthBase, heightBase, reduce]);

  // The whole factory is in view when the page opens, before the first paint.
  useLayoutEffect(() => {
    scale.set(actions.fitScale());
    const onResize = () => {
      if (!zoomed.current) scale.set(actions.fitScale());
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [actions, scale]);

  // A graph that grows or shrinks (the first snapshot of the live page) is fitted again, unless zoomed.
  useLayoutEffect(() => {
    if (!zoomed.current) scale.set(actions.fitScale());
  }, [contentWidth, contentHeight, actions, scale]);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return undefined;
    let pinch: { distance: number; scale: number } | null = null;
    const distance = (touches: TouchList) => {
      const [a, b] = [touches[0], touches[1]];
      return a && b ? Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) : 0;
    };
    const middle = (touches: TouchList) => {
      const [a, b] = [touches[0], touches[1]];
      const rect = element.getBoundingClientRect();
      return a && b
        ? { x: (a.clientX + b.clientX) / 2 - rect.left, y: (a.clientY + b.clientY) / 2 - rect.top }
        : { x: 0, y: 0 };
    };
    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      zoomed.current = true;
      pinch = { distance: distance(event.touches), scale: scale.get() };
    };
    const onMove = (event: TouchEvent) => {
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      const { x, y } = middle(event.touches);
      actions.setScale(
        actions.clamp((pinch.scale * distance(event.touches)) / pinch.distance),
        x,
        y,
      );
    };
    const onEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinch = null;
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomed.current = true;
      const rect = element.getBoundingClientRect();
      actions.setScale(
        actions.clamp(scale.get() * Math.exp(-event.deltaY / 300)),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    };
    element.addEventListener('touchstart', onStart, { passive: true });
    element.addEventListener('touchmove', onMove, { passive: false });
    element.addEventListener('touchend', onEnd);
    element.addEventListener('touchcancel', onEnd);
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('touchstart', onStart);
      element.removeEventListener('touchmove', onMove);
      element.removeEventListener('touchend', onEnd);
      element.removeEventListener('touchcancel', onEnd);
      element.removeEventListener('wheel', onWheel);
    };
  }, [actions, scale]);

  return {
    scroller,
    scale,
    width,
    height,
    zoomBy: actions.zoomBy,
    fit: actions.fit,
    reveal: actions.reveal,
  };
}

export function ZoomControls({ zoomBy, fit }: Pick<Zoom, 'zoomBy' | 'fit'>) {
  const { t } = useI18n();
  return (
    <div className={styles.zoom} role="group" aria-label={t.line.graph.zoom}>
      <IconButton
        className={styles.control}
        icon={ScreenFullIcon}
        aria-label={t.line.graph.fit}
        size="small"
        onClick={fit}
      />
      <IconButton
        className={styles.control}
        icon={ZoomOutIcon}
        aria-label={t.line.graph.zoomOut}
        size="small"
        onClick={() => zoomBy(1 / 1.25)}
      />
      <IconButton
        className={styles.control}
        icon={ZoomInIcon}
        aria-label={t.line.graph.zoomIn}
        size="small"
        onClick={() => zoomBy(1.25)}
      />
    </div>
  );
}
