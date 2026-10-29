import { Link } from 'react-router';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { textOn } from './contrast.ts';
import type { BadgeMark, BrandMark } from './marks.ts';
import { MarkIcon } from './MarkIcon.tsx';
import styles from './Badge.module.css';

/**
 * Valeur trop longue pour la place : tronquée sur une ligne (par défaut), coupée sur autant de lignes
 * qu'il faut (écran de détail), ou sur deux lignes au plus puis tronquée (cellule de tableau).
 */
export type BadgeOverflow = 'truncate' | 'wrap' | 'clamp';

/** Couleur d'un badge : les rôles de couleur de Primer, neutre par défaut. */
export type BadgeTone =
  'neutral' | 'accent' | 'success' | 'attention' | 'severe' | 'danger' | 'done';

export interface BadgeProps {
  /** Étiquette, la clé : un mot, en gris, à gauche (fournisseur, dépôt, « CI »). Facultative. */
  label?: string;
  /** Icône de l'étiquette : une octicon pour un concept, un logo pour une marque. */
  labelIcon?: BadgeMark;
  /** Couleur d'une octicon d'étiquette qui dit un état (issue ouverte, fermée). */
  labelIconTone?: Exclude<BadgeTone, 'neutral'>;
  /** L'étiquette prend la couleur de la marque (fournisseur), texte blanc ou noir selon sa luminance. */
  brand?: BrandMark | null;
  /** Valeur, la donnée : à droite ; c'est elle qui prend la couleur de l'état. */
  value: string;
  tone?: BadgeTone;
  /** Un état (CI) : la valeur peinte de la couleur franche du rôle, plutôt que teintée. */
  solid?: boolean;
  /** Identifiant (modèle, numéro, version) : la valeur en police de code. */
  code?: boolean;
  /** Le segment qui cède la place quand la largeur manque : la valeur (défaut) ou l'étiquette. */
  yields?: 'value' | 'label';
  /** Icône de la valeur, décorative : le texte dit déjà l'état ou la donnée. */
  icon?: BadgeMark | null;
  /** Ce que lisent les lecteurs d'écran et l'infobulle, quand il y a plus à dire que le texte visible. */
  description?: string;
  /** Page interne : tout le badge y mène. */
  to?: string;
  overflow?: BadgeOverflow;
}

/**
 * Un fait clé | valeur, à la manière du style « flat » de shields.io (étiquette grise ou aux couleurs
 * d'une marque, valeur à la couleur de l'état), en vrai texte avec les jetons Primer : lisible dans les
 * deux thèmes, sans image ni réseau. La valeur trop longue est tronquée proprement ; le texte entier
 * reste dans l'infobulle et pour les lecteurs d'écran.
 */
export function Badge({
  label,
  labelIcon,
  labelIconTone,
  brand,
  value,
  tone = 'neutral',
  solid = false,
  code = false,
  yields = 'value',
  icon,
  description,
  to,
  overflow = 'truncate',
}: BadgeProps) {
  const { t } = useI18n();
  const text = description ?? (label ? t.common.labelValue(label, value) : value);
  const painted = label && brand ? brand : null;
  const attributes = {
    className: styles.badge,
    title: text,
    'data-badge': '',
    'data-tone': tone,
    'data-solid': solid ? '' : undefined,
    'data-yields': yields,
    'data-code': code ? '' : undefined,
    'data-overflow': overflow,
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
          <span className={styles.text}>{label}</span>
        </span>
      ) : null}
      <span className={styles.value} data-segment="value" aria-hidden="true">
        {icon ? <MarkIcon mark={icon} className={styles.icon} background="value" /> : null}
        <span className={styles.text}>{value}</span>
      </span>
      <span className="fl-visually-hidden">{text}</span>
    </>
  );
  return to ? (
    <Link {...attributes} to={to}>
      {content}
    </Link>
  ) : (
    <span {...attributes}>{content}</span>
  );
}
