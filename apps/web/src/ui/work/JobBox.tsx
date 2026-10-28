import { Token } from '@primer/react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { AgentAvatar } from '../agents/AgentAvatar.tsx';
import { WorkStateIcon, WorkStateLabel } from './workState.tsx';
import type { WorkState } from './workState.tsx';
import styles from './work.module.css';

/** La liste des jobs d'une étape de la voie. */
export function JobList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul className={styles.jobs} aria-label={label}>
      {children}
    </ul>
  );
}

/**
 * Un job de la voie, à la manière d'un job de GitHub Actions : une boîte par issue (ligne d'usine) ou
 * par carte (graphe d'une issue). En tête l'icône d'état, le badge de l'objet et depuis quand ; puis
 * son titre ; puis l'état nommé et l'agent qui le tient ; puis ce qu'il fait (`children`). Toute la
 * boîte se touche. Elle garde son identité d'une étape à l'autre : quand l'objet change d'étape, elle
 * glisse vers sa nouvelle colonne (`layoutId`), sauf si les animations sont coupées.
 */
export function JobBox({
  id,
  state,
  badge,
  context,
  since,
  title,
  to,
  onSelect,
  selected = false,
  compact = false,
  agent,
  children,
}: {
  /** Identité stable de l'objet : la boîte glisse d'une étape à l'autre sous ce nom. */
  id: string;
  state: WorkState;
  /** Badge de l'objet : numéro d'issue, type de carte. */
  badge: string;
  /** À côté du badge, en retrait : dépôt, identifiant de carte. */
  context?: string;
  /** Depuis quand le job est à cette étape, déjà mis en forme. */
  since?: string;
  title: string;
  /** Page de l'objet : toute la boîte y mène. */
  to?: string;
  /** Ou bien : toute la boîte le choisit (une carte, pour voir ses runs). */
  onSelect?: () => void;
  selected?: boolean;
  /** Résumé d'une étape de bord : tête et titre sur une ligne. */
  compact?: boolean;
  /** L'agent qui tient le job. */
  agent?: string | null;
  /** Ce qu'il fait, ce qui bloque, ce qu'on attend de toi. */
  children?: ReactNode;
}) {
  return (
    <motion.li
      layoutId={id}
      layout="position"
      className={styles.job}
      data-tone={state.tone}
      data-compact={compact ? '' : undefined}
      data-selected={selected ? '' : undefined}
    >
      <span className={styles.jobHead}>
        <WorkStateIcon state={state} />
        <Token text={badge} size="small" className={styles.jobBadge} />
        {context ? <span className={styles.jobContext}>{context}</span> : null}
        {since ? <span className={styles.jobSince}>{since}</span> : null}
      </span>
      {to ? (
        <Link to={to} className={styles.jobTitle}>
          {title}
        </Link>
      ) : onSelect ? (
        <button
          type="button"
          className={styles.jobTitle}
          aria-pressed={selected}
          onClick={onSelect}
        >
          {title}
        </button>
      ) : (
        <span className={styles.jobTitle}>{title}</span>
      )}
      {compact ? null : (
        <span className={styles.jobWho}>
          <WorkStateLabel state={state} />
          {agent ? (
            <span className={styles.jobAgent}>
              <AgentAvatar profile={agent} size={16} named />
              <span className={styles.jobAgentName}>{agent}</span>
            </span>
          ) : null}
        </span>
      )}
      {children}
    </motion.li>
  );
}

/** Une ligne de détail d'un job : ce que fait l'agent, la question posée, la raison d'un blocage. */
export function JobDetail({
  tone = 'muted',
  code = false,
  children,
}: {
  tone?: 'muted' | 'attention' | 'danger';
  /** Commande ou chemin : en police de code. */
  code?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={styles.jobDetail} data-tone={tone} data-code={code ? '' : undefined}>
      {children}
    </span>
  );
}

/** Une action posée sur un job (répondre à une question) : elle passe devant le lien de la boîte. */
export function JobAction({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className={styles.jobAction}>
      {children}
    </Link>
  );
}
