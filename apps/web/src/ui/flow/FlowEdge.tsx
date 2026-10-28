import { BaseEdge, getSmoothStepPath } from '@xyflow/react';
import type { Edge, EdgeProps } from '@xyflow/react';
import { useEffect, useRef } from 'react';
import { useMotion } from '../motion.tsx';
import styles from './flow.module.css';

/** Un passage à montrer sur une liaison : une issue qui vient de changer de station. */
export interface FlowPacket {
  id: string;
  label: string;
}

export interface FlowEdgeData extends Record<string, unknown> {
  /** La liaison mène à une étape au travail : un flux la parcourt (boucle, coupée par la pause). */
  flowing?: boolean;
  /** Issues en transit : chacune glisse une fois de la source à la cible. */
  packets?: readonly FlowPacket[];
}

/** Durée du transit : `--motion-duration-long` de Primer (500 ms), le plafond pour un mouvement d'interface. */
export const TRANSIT_MS = 500;

function Packet({ packet, path }: { packet: FlowPacket; path: string }) {
  const motion = useRef<SVGAnimateMotionElement | null>(null);
  useEffect(() => {
    // Une animation SVG ajoutée après coup démarre sinon au début du document, donc déjà finie.
    motion.current?.beginElement();
  }, []);
  return (
    <g className={styles.packet} aria-hidden="true">
      <rect x="-18" y="-10" width="36" height="20" rx="10" className={styles.packetBody} />
      <text className={styles.packetLabel} textAnchor="middle" dominantBaseline="central">
        {packet.label}
      </text>
      <animateMotion
        ref={motion}
        begin="indefinite"
        dur={`${TRANSIT_MS}ms`}
        fill="freeze"
        path={path}
        calcMode="spline"
        keyPoints="0;1"
        keyTimes="0;1"
        keySplines="0.42 0 0.58 1"
      />
    </g>
  );
}

export function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps<Edge<FlowEdgeData>>) {
  const { enabled } = useMotion();
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
  });
  return (
    <>
      <BaseEdge
        {...(markerEnd ? { markerEnd } : {})}
        id={id}
        path={path}
        className={styles.edge}
        data-active={data?.flowing ? '' : undefined}
      />
      {data?.flowing ? <path d={path} className={styles.flow} data-loop="" /> : null}
      {enabled
        ? data?.packets?.map((packet) => <Packet key={packet.id} packet={packet} path={path} />)
        : null}
    </>
  );
}
