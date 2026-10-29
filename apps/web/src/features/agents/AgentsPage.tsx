import type { AgentActivity, ProfileView } from '@factory-live/contracts';
import { AlertIcon, ArrowRightIcon } from '@primer/octicons-react';
import { Heading, Label, Token } from '@primer/react';
import { useProfiles, useSnapshot } from '../../data/FactoryProvider.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { AgentAvatar } from '../../ui/agents/AgentAvatar.tsx';
import { IssueBadge } from '../../ui/badge/IssueBadge.tsx';
import { Elapsed } from '../../ui/Elapsed.tsx';
import { LiveDot } from '../../ui/LiveDot.tsx';
import { ModelBadge } from '../../ui/ModelBadge.tsx';
import type { ModelName } from '../../ui/ModelBadge.tsx';
import { actionModel, parseModelLinks } from '../../ui/modelText.ts';
import page from '../../ui/page.module.css';
import styles from './agents.module.css';

/** Les modèles d'un côté d'un écart (en service ou dans le dépôt), en badges ; sinon le texte tel quel. */
function DriftModels({ models, fallback }: { models: ModelName[] | null; fallback: string }) {
  if (!models) return <span className={styles.driftLive}>{fallback}</span>;
  return (
    <>
      {models.map((model, index) => (
        <ModelBadge key={`${model.model}-${index}`} model={model} overflow="wrap" />
      ))}
    </>
  );
}

function AgentProfileCard({
  profile,
  activity,
}: {
  profile: ProfileView;
  activity: AgentActivity | undefined;
}) {
  const { t, fmt, text } = useI18n();
  const working = activity && activity.state !== 'idle';
  // La pastille dit l'état comme l'anneau de l'avatar : bleue au travail, rouge bloqué, grise sinon.
  const busy =
    activity?.state === 'thinking' || activity?.state === 'tool' || activity?.state === 'cli';
  return (
    <article
      className={styles.card}
      data-working={working ? 'true' : undefined}
      aria-labelledby={`agent-${profile.name}`}
    >
      <header className={styles.head}>
        <AgentAvatar profile={profile.name} size={40} state={activity?.state ?? 'idle'} named />
        <h2 id={`agent-${profile.name}`} className={styles.name}>
          {profile.name}
        </h2>
        <Label variant="secondary">{t.station[profile.station]}</Label>
      </header>
      <p className={styles.role}>{text(profile.role)}</p>

      <div className={styles.now}>
        <LiveDot
          tone={busy ? 'accent' : activity?.state === 'blocked' ? 'danger' : 'muted'}
          pulse={busy}
        />
        {activity && working ? (
          <span>
            {t.agentState[activity.state]}
            {activity.issueKey ? (
              <>
                {' '}
                {t.agents.on} <IssueBadge issueKey={activity.issueKey} state="open" link />
              </>
            ) : null}
            {activity.runStartedAt ? (
              <>
                {' '}
                {t.agents.since} <Elapsed since={activity.runStartedAt} />
              </>
            ) : null}
          </span>
        ) : (
          <span className={styles.muted}>
            {activity?.state === 'queued' ? t.agentState.queued : t.agentState.idle}
          </span>
        )}
      </div>
      {activity?.action ? (
        <p className={styles.action}>
          {text(activity.action.label)}
          {activity.action.detail && !actionModel(activity) ? (
            <span className={styles.actionDetail}> {activity.action.detail}</span>
          ) : null}
        </p>
      ) : null}

      <section className={styles.block} aria-label={t.agents.chain}>
        <h3 className={styles.blockTitle}>{t.agents.chainTitle}</h3>
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
                overflow="wrap"
              />
            </li>
          ))}
        </ol>
        {profile.effort ? <p className={styles.muted}>{t.agents.effort(profile.effort)}</p> : null}
      </section>

      {profile.drift.length > 0 ? (
        <section className={styles.drift} aria-label={t.agents.drift}>
          <p className={styles.driftTitle}>
            <AlertIcon size={14} aria-hidden="true" /> {t.agents.driftTitle}
          </p>
          <ul className={styles.driftList}>
            {profile.drift.map((drift) => {
              // Un écart de modèle ou de fallbacks : des badges de modèle, comme partout ailleurs.
              const models = (value: string | null) =>
                (drift.field === 'model' || drift.field === 'fallbacks') && value
                  ? parseModelLinks(value)
                  : null;
              const [live, repo] = [models(drift.live), models(drift.repo)];
              if (live || repo)
                return (
                  <li key={drift.field}>
                    <span className={styles.driftModels}>
                      <code>{t.agents.field[drift.field]}</code>
                      {t.common.colon}
                      <DriftModels
                        models={live}
                        fallback={drift.live ?? t.agents.unset[drift.field]}
                      />
                      <span className={styles.driftRepoModels}>
                        <span className={styles.muted}>
                          {t.agents.driftRepoLabel}
                          {t.common.colon}
                        </span>
                        <DriftModels
                          models={repo}
                          fallback={drift.repo ?? t.agents.unset[drift.field]}
                        />
                      </span>
                    </span>
                  </li>
                );
              return (
                <li key={drift.field}>
                  <code>{t.agents.field[drift.field]}</code>
                  {t.common.colon}
                  <span className={styles.driftLive}>
                    {drift.live ?? t.agents.unset[drift.field]}
                  </span>
                  <span className={styles.muted}>
                    {t.agents.driftRepo(drift.repo ?? t.agents.unset[drift.field])}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className={styles.block} aria-label={t.agents.tools}>
        <h3 className={styles.blockTitle}>{t.agents.skills}</h3>
        <div className={styles.tokens}>
          {profile.skills.map((skill) => (
            <Token key={skill} text={skill} size="small" />
          ))}
        </div>
        <h3 className={styles.blockTitle}>{t.agents.plugins}</h3>
        <div className={styles.tokens}>
          {profile.plugins.map((plugin) => (
            <Token
              key={plugin.name}
              text={
                plugin.refusals > 0 ? t.agents.refusals(plugin.name, plugin.refusals) : plugin.name
              }
              size="small"
            />
          ))}
        </div>
        <h3 className={styles.blockTitle}>{t.agents.toolsets(profile.mcp.length > 0)}</h3>
        <p className={styles.toolsets}>
          {profile.toolsets.join(' · ')}
          {profile.mcp.length > 0 ? ` · MCP ${profile.mcp.join(', ')}` : ''}
        </p>
      </section>

      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt className={styles.statTerm}>{t.agents.runs}</dt>
          <dd className={styles.statValue}>{profile.stats.runs}</dd>
        </div>
        <div className={styles.stat}>
          <dt className={styles.statTerm}>{t.agents.gatePass}</dt>
          <dd className={styles.statValue}>
            {profile.stats.gatePassRate !== null
              ? fmt.percent(profile.stats.gatePassRate)
              : t.agents.notApplicable}
          </dd>
        </div>
        <div className={styles.stat}>
          <dt className={styles.statTerm}>{t.agents.medianDuration}</dt>
          <dd className={styles.statValue}>
            {profile.stats.medianRunMinutes !== null
              ? fmt.minutes(profile.stats.medianRunMinutes)
              : t.common.unknown}
          </dd>
        </div>
        <div className={styles.stat}>
          <dt className={styles.statTerm}>{t.agents.cost}</dt>
          <dd className={styles.statValue}>
            {profile.stats.costUsd !== null ? fmt.usd(profile.stats.costUsd) : t.common.free}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export function AgentsPage() {
  const { t } = useI18n();
  const profiles = useProfiles();
  const snapshot = useSnapshot();
  const drifting = profiles.filter((profile) => profile.drift.length > 0).length;
  return (
    <section className={page.page} aria-labelledby="agents-title">
      <header className={page.head}>
        <div>
          <Heading as="h1" variant="medium" id="agents-title">
            {t.agents.title}
          </Heading>
          <p className={page.intro}>
            {t.agents.intro(profiles.length)}
            {drifting > 0 ? t.agents.drifting(drifting) : ''}
          </p>
        </div>
      </header>
      <div className={styles.grid}>
        {profiles.map((profile) => (
          <AgentProfileCard
            key={profile.name}
            profile={profile}
            activity={snapshot.agents.find((agent) => agent.profile === profile.name)}
          />
        ))}
      </div>
    </section>
  );
}
