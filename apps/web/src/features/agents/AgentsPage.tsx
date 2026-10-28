import type { AgentActivity, ProfileView } from '@factory-live/contracts';
import { AlertIcon, ArrowRightIcon } from '@primer/octicons-react';
import { Heading, Label, Token } from '@primer/react';
import { Link } from 'react-router';
import { useProfiles, useSnapshot } from '../../data/FactoryProvider.tsx';
import { Elapsed } from '../../ui/Elapsed.tsx';
import { LiveDot } from '../../ui/LiveDot.tsx';
import { ModelBadge } from '../../ui/ModelBadge.tsx';
import { ProfileIcon } from '../../ui/ProfileIcon.tsx';
import { formatPercent, formatUsd } from '../../ui/format.ts';
import { AGENT_STATE_LABEL, STATION_LABEL } from '../../ui/vocabulary.ts';
import { issuePath } from '../issues/paths.ts';
import page from '../../ui/page.module.css';
import styles from './agents.module.css';

function ProfileCard({
  profile,
  activity,
}: {
  profile: ProfileView;
  activity: AgentActivity | undefined;
}) {
  const working = activity && activity.state !== 'idle';
  return (
    <article
      className={styles.card}
      data-working={working ? 'true' : undefined}
      aria-labelledby={`profil-${profile.name}`}
    >
      <header className={styles.head}>
        <ProfileIcon profile={profile.name} />
        <h2 id={`profil-${profile.name}`} className={styles.name}>
          {profile.name}
        </h2>
        <Label variant="secondary">{STATION_LABEL[profile.station]}</Label>
      </header>
      <p className={styles.role}>{profile.role}</p>

      <div className={styles.now}>
        <LiveDot tone={working ? 'success' : 'muted'} pulse={Boolean(working)} />
        {activity && working ? (
          <span>
            {AGENT_STATE_LABEL[activity.state]}
            {activity.issueKey ? (
              <>
                {' '}
                sur <Link to={issuePath(activity.issueKey)}>{activity.issueKey}</Link>
              </>
            ) : null}
            {activity.runStartedAt ? (
              <>
                {' '}
                depuis <Elapsed since={activity.runStartedAt} />
              </>
            ) : null}
          </span>
        ) : (
          <span className={styles.muted}>
            {activity?.state === 'queued' ? 'En file' : 'Au repos'}
          </span>
        )}
      </div>
      {activity?.action ? (
        <p className={styles.action}>
          {activity.action.label}
          {activity.action.detail ? ` · ${activity.action.detail}` : ''}
        </p>
      ) : null}

      <section className={styles.block} aria-label="Chaîne de modèles">
        <h3 className={styles.blockTitle}>Modèles, dans l’ordre des fallbacks</h3>
        <ol className={styles.chain}>
          {profile.modelChain.map((model, index) => (
            <li key={`${model.provider}-${model.model}-${index}`} className={styles.chainItem}>
              {index > 0 ? (
                <ArrowRightIcon size={12} className={styles.chainArrow} aria-hidden="true" />
              ) : null}
              <ModelBadge
                model={
                  index === 0 && activity?.model && activity.model.source === 'live'
                    ? activity.model
                    : model
                }
              />
            </li>
          ))}
        </ol>
        {profile.effort ? (
          <p className={styles.muted}>Effort de raisonnement : {profile.effort}</p>
        ) : null}
      </section>

      {profile.drift.length > 0 ? (
        <section className={styles.drift} aria-label="Dérive de configuration">
          <p className={styles.driftTitle}>
            <AlertIcon size={14} aria-hidden="true" /> En service, différent du dépôt de la factory
          </p>
          <ul className={styles.driftList}>
            {profile.drift.map((drift) => (
              <li key={drift.field}>
                <code>{drift.field}</code> : <span className={styles.driftLive}>{drift.live}</span>
                <span className={styles.muted}> (dépôt : {drift.repo})</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={styles.block} aria-label="Outils, skills et plugins">
        <h3 className={styles.blockTitle}>Skills</h3>
        <div className={styles.tokens}>
          {profile.skills.map((skill) => (
            <Token key={skill} text={skill} size="small" />
          ))}
        </div>
        <h3 className={styles.blockTitle}>Plugins et refus des gardes (7 jours)</h3>
        <div className={styles.tokens}>
          {profile.plugins.map((plugin) => (
            <Token
              key={plugin.name}
              text={plugin.refusals > 0 ? `${plugin.name} · ${plugin.refusals} refus` : plugin.name}
              size="small"
            />
          ))}
        </div>
        <h3 className={styles.blockTitle}>Toolsets{profile.mcp.length > 0 ? ' et MCP' : ''}</h3>
        <p className={styles.toolsets}>
          {profile.toolsets.join(' · ')}
          {profile.mcp.length > 0 ? ` · MCP ${profile.mcp.join(', ')}` : ''}
        </p>
      </section>

      <dl className={styles.stats}>
        <div>
          <dt>Runs</dt>
          <dd>{profile.stats.runs}</dd>
        </div>
        <div>
          <dt>Passage en gate</dt>
          <dd>
            {profile.stats.gatePassRate !== null
              ? formatPercent(profile.stats.gatePassRate)
              : 'sans objet'}
          </dd>
        </div>
        <div>
          <dt>Durée médiane</dt>
          <dd>
            {profile.stats.medianRunMinutes !== null
              ? `${profile.stats.medianRunMinutes} min`
              : '?'}
          </dd>
        </div>
        <div>
          <dt>Coût estimé</dt>
          <dd>{profile.stats.costUsd !== null ? formatUsd(profile.stats.costUsd) : 'gratuit'}</dd>
        </div>
      </dl>
    </article>
  );
}

export function AgentsPage() {
  const profiles = useProfiles();
  const snapshot = useSnapshot();
  const drifting = profiles.filter((profile) => profile.drift.length > 0).length;
  return (
    <section className={page.page} aria-labelledby="agents-title">
      <header className={page.head}>
        <div>
          <Heading as="h1" variant="medium" id="agents-title">
            Agents
          </Heading>
          <p className={page.intro}>
            Les {profiles.length} profils de la factory, avec la configuration réellement en
            service.
            {drifting > 0 ? ` ${drifting} profils diffèrent du dépôt hermes-software-factory.` : ''}
          </p>
        </div>
      </header>
      <div className={styles.grid}>
        {profiles.map((profile) => (
          <ProfileCard
            key={profile.name}
            profile={profile}
            activity={snapshot.agents.find((agent) => agent.profile === profile.name)}
          />
        ))}
      </div>
    </section>
  );
}
