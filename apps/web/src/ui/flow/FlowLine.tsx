import type { Icon } from '@primer/octicons-react';
import type { CSSProperties, ReactNode } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import { FlowStop } from './FlowStop.tsx';
import type { FlowTone } from './FlowStop.tsx';
import styles from './flow.module.css';

/** Une étape de la voie : une station de la ligne d'usine, ou un rang de cartes d'une issue. */
export interface LineStep {
  id: string;
  icon: Icon;
  tone: FlowTone;
  title: ReactNode;
  /** Compteur posé sur l'arrêt ; décoratif, le titre ou la liste le disent aussi. */
  aside?: ReactNode;
  /** À côté du titre : l'équipe de l'étape. */
  meta?: ReactNode;
  /** Étape de bord (intake, terminé) : colonne plus étroite, ses jobs résumés. */
  compact?: boolean;
  /** La voie qui part de cette étape mène à une étape au travail : un flux la parcourt. */
  flowing?: boolean;
  /** Les jobs de l'étape (`JobList`). */
  children?: ReactNode;
}

const REM = 16;
/** Largeurs minimales des colonnes, en rem : en dessous, la voie passe à la verticale. */
const COMPACT_MIN = 7;
const GAP = 1.5;

/** Largeur sous laquelle les colonnes ne tiennent plus côte à côte (px). */
export function lineMinWidth(
  steps: readonly Pick<LineStep, 'compact'>[],
  columnMin: number,
): number {
  const columns = steps.reduce(
    (total, step) => total + (step.compact ? COMPACT_MIN : columnMin),
    0,
  );
  return (columns + GAP * Math.max(steps.length - 1, 0)) * REM;
}

/** Largeur du conteneur, lue avant le premier affichage puis suivie. */
function useWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    setWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * La voie de factory-live, la même pour la ligne d'usine et pour une issue, à la manière du graphe
 * d'un workflow GitHub Actions : des arrêts reliés par une voie, et sous chaque arrêt ses jobs, une
 * boîte chacun. En largeur quand les colonnes tiennent, sinon en hauteur (téléphone) ; dans les deux
 * cas la page défile normalement et chaque job se touche. Rien n'est affiché avant la mesure, pour
 * qu'aucun job ne glisse d'une disposition à l'autre au chargement.
 */
export function FlowLine({
  steps,
  label,
  columnMin = 10,
}: {
  steps: readonly LineStep[];
  label: string;
  /** Largeur minimale d'une colonne ordinaire, en rem. */
  columnMin?: number;
}) {
  const [ref, width] = useWidth();
  const horizontal = width >= lineMinWidth(steps, columnMin);
  const columns: CSSProperties = {
    gridTemplateColumns: steps
      .map((step) =>
        step.compact ? `minmax(${COMPACT_MIN}rem, 0.6fr)` : `minmax(${columnMin}rem, 1fr)`,
      )
      .join(' '),
  };
  return (
    <div
      ref={ref}
      className={styles.line}
      data-orientation={horizontal ? 'horizontal' : 'vertical'}
      role="group"
      aria-label={label}
    >
      {width === 0 ? null : (
        <ol className={styles.steps} style={horizontal ? columns : undefined}>
          {steps.map((step, index) => {
            const following = steps[index + 1];
            return (
              <li
                key={step.id}
                className={styles.step}
                data-compact={step.compact ? '' : undefined}
              >
                <span className={styles.track} aria-hidden="true">
                  <FlowStop icon={step.icon} tone={step.tone} aside={step.aside} />
                  {following ? (
                    <span className={styles.link} data-active={step.flowing ? '' : undefined}>
                      {step.flowing ? <span className={styles.flow} data-loop="" /> : null}
                    </span>
                  ) : null}
                </span>
                <div className={styles.stepHead}>
                  <span className={styles.stepTitle}>{step.title}</span>
                  {step.meta ? <span className={styles.stepMeta}>{step.meta}</span> : null}
                </div>
                {step.children ? <div className={styles.stepBody}>{step.children}</div> : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
