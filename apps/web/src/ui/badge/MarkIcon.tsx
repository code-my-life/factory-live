import { markStyle } from './contrast.ts';
import { isBrand } from './marks.ts';
import type { BadgeMark } from './marks.ts';

/**
 * Une icône décorative, la même dans un badge et sur une tuile de la page Santé : une octicon, ou le
 * tracé d'un logo de Simple Icons en SVG inline. Un logo garde sa couleur de marque là où elle se voit
 * (3:1 sur le fond, dans chaque thème), sinon la couleur du texte ; sur une étiquette déjà peinte de
 * la marque, il prend la couleur du texte (blanc ou noir), comme le `logoColor` de shields.io.
 */
export function MarkIcon({
  mark,
  className,
  size = 12,
  background = 'value',
  painted = false,
  fill,
}: {
  mark: BadgeMark;
  className?: string | undefined;
  /** The color of an octicon, in place of the text color; a brand logo has its own. */
  fill?: string | undefined;
  size?: 12 | 16;
  /** Le fond sous l'icône : celui de la page (valeur d'un badge, tuile) ou l'étiquette grise. */
  background?: 'label' | 'value';
  painted?: boolean;
}) {
  if (!isBrand(mark)) {
    const Octicon = mark;
    return <Octicon {...(fill ? { fill } : {})} size={size} className={className} />;
  }
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      data-mark="brand"
      style={painted ? undefined : markStyle(mark.hex, background)}
    >
      <path d={mark.path} />
    </svg>
  );
}
