import type { StationKind } from '@factory-live/contracts';
import type { Icon } from '@primer/octicons-react';
import type { Frame } from '../layout.ts';
import { KindChip } from './KindChip.tsx';
import styles from '../graph.module.css';

/**
 * The frame of a group of stations (the gate's proofs): its title above its first member, with its
 * icon and the kind of work its members share, said once for all of them.
 */
export function GroupFrame({
  frame,
  label,
  hint,
  icon: GroupIcon,
  kind,
}: {
  frame: Frame;
  label: string;
  hint: string;
  icon: Icon;
  kind: StationKind | null;
}) {
  return (
    <div
      className={styles.gateFrame}
      style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
      title={hint}
    >
      <span className={styles.gateTitle}>
        <GroupIcon size={16} className={styles.headIcon} aria-hidden="true" />
        <span className={styles.headName}>{label}</span>
        {kind ? <KindChip kind={kind} /> : null}
      </span>
    </div>
  );
}
