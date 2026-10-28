import type { Icon } from '@primer/octicons-react';
import type { ReactNode } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { useMotion } from '../motion.tsx';
import { TRANSIT_MS } from './FlowEdge.tsx';
import type { FlowEdgeData, FlowPacket } from './FlowEdge.tsx';
import { FlowStop } from './FlowNode.tsx';
import type { FlowTone } from './FlowNode.tsx';
import styles from './flow.module.css';

/** Une étape de la voie : une station de la ligne d'usine ou une carte d'une issue. */
export interface RailStep {
  id: string;
  icon: Icon;
  tone: FlowTone;
  /** Du travail en cours ici : l'arrêt respire, comme dans le graphe. */
  active?: boolean;
  /** Compteur posé sur l'arrêt ; décoratif, le titre ou son contenu le disent aussi. */
  aside?: ReactNode;
  title: ReactNode;
  /** À droite du titre : équipe, état. */
  meta?: ReactNode;
  children?: ReactNode;
  /** La liaison vers l'étape suivante : un flux quand elle sert, les issues en transit. */
  next?: FlowEdgeData;
  /** Menée en parallèle de l'étape précédente (cartes sœurs) : la liaison passe en pointillés. */
  parallel?: boolean;
  selected?: boolean;
  /** L'étape se choisit d'un toucher sur toute sa surface (une carte, pour voir ses runs). */
  onSelect?: () => void;
}

/** Une issue qui vient de passer : elle glisse une fois le long de la liaison, comme sur le graphe. */
function RailPacket({ packet }: { packet: FlowPacket }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    const link = element?.parentElement;
    if (!element || !link || typeof element.animate !== 'function') return;
    const distance = Math.max(link.clientHeight - element.offsetHeight, 0);
    element.animate(
      [{ transform: 'translate(-50%, 0)' }, { transform: `translate(-50%, ${distance}px)` }],
      { duration: TRANSIT_MS, easing: 'cubic-bezier(0.42, 0, 0.58, 1)', fill: 'forwards' },
    );
  }, []);
  return (
    <span ref={ref} className={styles.railPacket}>
      <span className={styles.railPacketBody}>{packet.label}</span>
    </span>
  );
}

/**
 * Le graphe sur téléphone : les mêmes arrêts et les mêmes liaisons, posés en voie verticale dans le
 * flux de la page. Rien n'y capture le doigt : la page défile, chaque ligne se touche, et chaque
 * étape montre son contenu en clair au lieu d'un graphe réduit.
 */
export function FlowRail({ steps, label }: { steps: readonly RailStep[]; label?: string }) {
  const { enabled } = useMotion();
  return (
    <ol {...(label ? { 'aria-label': label } : {})} className={styles.rail}>
      {steps.map((step, index) => {
        const following = steps[index + 1];
        return (
          <li
            key={step.id}
            className={styles.railStep}
            data-selected={step.selected ? '' : undefined}
            data-selectable={step.onSelect ? '' : undefined}
          >
            <span className={styles.railTrack} aria-hidden="true">
              <FlowStop
                icon={step.icon}
                tone={step.tone}
                active={step.active ?? false}
                aside={step.aside}
              />
              {following ? (
                <span
                  className={styles.railLink}
                  data-active={step.next?.flowing ? '' : undefined}
                  data-parallel={following.parallel ? '' : undefined}
                >
                  {step.next?.flowing ? <span className={styles.railFlow} data-loop="" /> : null}
                  {enabled
                    ? step.next?.packets?.map((packet) => (
                        <RailPacket key={packet.id} packet={packet} />
                      ))
                    : null}
                </span>
              ) : null}
            </span>
            <div className={styles.railBody}>
              <div className={styles.railHead}>
                {step.onSelect ? (
                  <button
                    type="button"
                    className={styles.railSelect}
                    aria-pressed={Boolean(step.selected)}
                    onClick={step.onSelect}
                  >
                    {step.title}
                  </button>
                ) : (
                  <span className={styles.railTitle}>{step.title}</span>
                )}
                {step.meta ? <span className={styles.railMeta}>{step.meta}</span> : null}
              </div>
              {step.children}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
