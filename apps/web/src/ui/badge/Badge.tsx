import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { textOn } from './contrast.ts';
import type { Hue } from './hues.ts';
import type { BadgeMark, BrandMark } from './marks.ts';
import { MarkIcon } from './MarkIcon.tsx';
import { splitMiddle } from './middle.ts';
import styles from './Badge.module.css';

/** Color of a state: Primer's color roles, neutral by default (CI, states). */
export type BadgeTone =
  'neutral' | 'accent' | 'success' | 'attention' | 'severe' | 'danger' | 'done';

export interface BadgeProps {
  /** Label, the key: one word, in grey, on the left (type, provider, repository, « CI »). Optional. */
  label?: string;
  /** Icône de l'étiquette : une octicon pour un concept, un logo pour une marque. */
  labelIcon?: BadgeMark;
  /** Label image (an agent's avatar), decorative: a data URI. */
  labelImage?: string;
  /** Couleur d'une octicon d'étiquette qui dit un état (issue ouverte, fermée). */
  labelIconTone?: Exclude<BadgeTone, 'neutral'>;
  /** L'étiquette prend la couleur de la marque (fournisseur), texte blanc ou noir selon sa luminance. */
  brand?: BrandMark | null;
  /** Value, the data: on the right; it is what takes the item's color. */
  value: string;
  /** The item's hue (Primer's display palette): value, frame, separator, value icon. */
  hue?: Hue;
  /** GitHub label: its color (hexadecimal without « # »), tinted at 18 % on the value, 45 % on the frame. */
  githubColor?: string;
  /** The color of a state (CI): the role's « muted » tokens, in place of a hue. */
  tone?: BadgeTone;
  /** Identifier (model, branch, card, version): the value in a code font, cut in the middle. */
  code?: boolean;
  /** Le segment qui cède la place quand la largeur manque : la valeur (défaut) ou l'étiquette. */
  yields?: 'value' | 'label';
  /** Icône de la valeur, décorative : le texte dit déjà l'état ou la donnée. */
  icon?: BadgeMark | null;
  /** Ce que lisent les lecteurs d'écran et l'infobulle, quand il y a plus à dire que le texte visible. */
  description?: string;
  /** Page interne : tout le badge y mène. */
  to?: string;
  /** External page (GitHub): the whole badge leads there, in a new tab. */
  href?: string;
}

/** The properties Badge.module.css reads to tint the value, the frame and the value icon. */
function tintStyle(
  hue: Hue | undefined,
  githubColor: string | undefined,
): CSSProperties | undefined {
  if (hue)
    return {
      '--fl-hue-bg': `var(--display-${hue}-bgColor-muted)`,
      '--fl-hue-border': `var(--display-${hue}-borderColor-muted)`,
      '--fl-hue-fg': `var(--display-${hue}-fgColor)`,
    } as CSSProperties;
  if (githubColor)
    // The label color is data from GitHub, not a Primer token: tinted over the page background.
    return {
      '--fl-hue-bg': `color-mix(in srgb, #${githubColor} 18%, var(--bgColor-default))`,
      '--fl-hue-border': `color-mix(in srgb, #${githubColor} 45%, var(--bgColor-default))`,
      '--fl-hue-fg': 'var(--fgColor-muted)',
    } as CSSProperties;
  return undefined;
}

/**
 * A key | value fact, in the manner of shields.io's « flat » style (grey label or in a brand's
 * colors, value tinted with the item's color), as real text with Primer tokens: readable in both
 * themes, with no image or network. Always on one line: a code-font value that is too long is cut
 * in the middle (its last segments stay whole), any other at the end; the full text stays in the
 * tooltip and for screen readers.
 */
export function Badge({
  label,
  labelIcon,
  labelImage,
  labelIconTone,
  brand,
  value,
  hue,
  githubColor,
  tone = 'neutral',
  code = false,
  yields = 'value',
  icon,
  description,
  to,
  href,
}: BadgeProps) {
  const { t } = useI18n();
  const text = description ?? (label ? t.common.labelValue(label, value) : value);
  const painted = label && brand ? brand : null;
  const tinted = tintStyle(hue, githubColor);
  const middle = code ? splitMiddle(value) : null;
  const attributes = {
    className: styles.badge,
    title: text,
    'data-badge': '',
    'data-tone': tone,
    'data-hue': hue,
    'data-tint': tinted ? '' : undefined,
    'data-yields': yields,
    'data-code': code ? '' : undefined,
    // A badge never wraps: a value too long for the room is cut, on one line, never on several.
    'data-overflow': 'truncate',
    style: tinted,
  };
  const content = (
    <>
      {label ? (
        <span
          className={styles.label}
          data-segment="label"
          data-brand={painted?.title}
          data-icon-tone={labelIconTone}
          // Couleur de marque (Simple Icons) : une donnée, pas un jeton ; texte au contraste calculé.
          style={painted ? { backgroundColor: painted.hex, color: textOn(painted.hex) } : undefined}
          aria-hidden="true"
        >
          {labelIcon ? (
            <MarkIcon
              mark={labelIcon}
              className={styles.icon}
              background="label"
              painted={painted !== null}
            />
          ) : null}
          {labelImage ? <img className={styles.image} src={labelImage} alt="" /> : null}
          <span className={styles.text}>{label}</span>
        </span>
      ) : null}
      <span className={styles.value} data-segment="value" aria-hidden="true">
        {icon ? (
          <MarkIcon
            {...(hue ? { fill: 'var(--fl-hue-fg)' } : {})}
            mark={icon}
            className={styles.icon}
            background="value"
          />
        ) : null}
        {middle ? (
          <span className={styles.text} data-split="">
            <span className="fl-visually-hidden">{value}</span>
            <span className={styles.head} data-part="head">
              {middle.head}
            </span>
            <span className={styles.tail} data-part="tail">
              {middle.tail}
            </span>
          </span>
        ) : (
          <span className={styles.text}>{value}</span>
        )}
      </span>
      <span className="fl-visually-hidden">{text}</span>
    </>
  );
  if (to)
    return (
      <Link {...attributes} to={to}>
        {content}
      </Link>
    );
  if (href)
    return (
      <a {...attributes} href={href} target="_blank" rel="noreferrer">
        {content}
      </a>
    );
  return <span {...attributes}>{content}</span>;
}
