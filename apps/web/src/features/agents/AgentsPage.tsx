import type {
  AgentActivity,
  ConfigField,
  ProfileLimit,
  ProfileView,
} from '@factory-live/contracts';
import { AlertIcon, ArrowRightIcon } from '@primer/octicons-react';
import { Heading } from '@primer/react';
import type { ReactNode } from 'react';
import { useProfiles, useSnapshot } from '../../data/FactoryProvider.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { AgentAvatar } from '../../ui/agents/AgentAvatar.tsx';
import { EffortBadge, McpBadge, PluginBadge, ToolsetBadge } from '../../ui/badge/ConfigBadges.tsx';
import { hiddenToolset, splitNames } from '../../ui/badge/config.ts';
import { IssueBadge } from '../../ui/badge/IssueBadge.tsx';
import { SkillBadge } from '../../ui/badge/SkillBadge.tsx';
import { Elapsed } from '../../ui/Elapsed.tsx';
import { StationMark } from '../../ui/flow/StationMark.tsx';
import { LiveDot } from '../../ui/LiveDot.tsx';
import { ModelBadge } from '../../ui/ModelBadge.tsx';
import { actionModel, parseModelLinks } from '../../ui/modelText.ts';
import page from '../../ui/page.module.css';
import styles from './agents.module.css';

/**
 * The items on one side of a drift (live or in the repo) as badges: models, toolsets or plugins;
 * `null` when the value does not have that shape (shown as is).
 */
function driftBadges(field: ConfigField, value: string | null): ReactNode[] | null {
  if (!value) return null;
  if (field === 'toolsets')
    return splitNames(value).map((name) => <ToolsetBadge key={name} name={name} />);
  if (field === 'plugins')
    return splitNames(value).map((name) => <PluginBadge key={name} name={name} />);
  if (field !== 'model' && field !== 'fallbacks') return null;
  return (
    parseModelLinks(value)?.map((model, index) => (
      <ModelBadge key={`${model.model}-${index}`} model={model} />
    )) ?? null
  );
}

function DriftSide({ badges, fallback }: { badges: ReactNode[] | null; fallback: string }) {
  if (!badges) return <span className={styles.driftLive}>{fallback}</span>;
  return <>{badges}</>;
}

/** La limite appliquée : la valeur réglée, sinon celle d'Hermès par défaut ; `null` : sans limite. */
function applied(limit: ProfileLimit | undefined): number | null {
  return limit ? (limit.value ?? limit.defaultValue) : null;
}

/**
 * Le délai réel du hook d'un plugin : celui du hook, plafonné par celui de l'appel d'outil, qui
 * englobe le hook (le plafond des outils d'Hermès coupe aussi un contrôle lancé dans un hook).
 */
function effectiveHookLimit(limits: readonly ProfileLimit[]): number | null {
  const hook = applied(limits.find((limit) => limit.key === 'hook_callback_timeout'));
  const tool = applied(limits.find((limit) => limit.key === 'tool_deadline'));
  if (hook === null) return tool;
  return tool === null ? hook : Math.min(hook, tool);
}

/** Les délais d'Hermès qui coupent le travail de l'agent, réglés ou par défaut. */
function Limits({ limits }: { limits: readonly ProfileLimit[] }) {
  const { t, fmt } = useI18n();
  if (limits.length === 0) return null;
  const write = (limit: ProfileLimit) => {
    const value = limit.value ?? limit.defaultValue;
    if (value === null) return t.agents.unlimited;
    const text = limit.unit === 'turns' ? t.agents.turns(value) : fmt.duration(value * 1000);
    return t.agents.limitValue(text, limit.value === null);
  };
  return (
    <section className={styles.block} aria-label={t.agents.limits}>
      <h3 className={styles.blockTitle}>{t.agents.limits}</h3>
      <dl className={styles.limits}>
        {limits.map((limit) => (
          <div key={limit.key} className={styles.limit}>
            <dt className={styles.limitTerm}>{t.agents.limit[limit.key]}</dt>
            <dd className={styles.limitData}>{write(limit)}</dd>
          </div>
        ))}
      </dl>
    </section>
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
  const hookLimit = effectiveHookLimit(profile.limits);
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
        <span className={styles.station}>
          <StationMark station={profile.station} />
        </span>
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
              />
            </li>
          ))}
        </ol>
        {profile.effort ? (
          // In its own row, like the other badges of a block: a flex column would stretch it.
          <div className={styles.tokens}>
            <EffortBadge level={profile.effort} description={t.agents.effort(profile.effort)} />
          </div>
        ) : null}
      </section>

      {profile.drift.length > 0 ? (
        <section className={styles.drift} aria-label={t.agents.drift}>
          <p className={styles.driftTitle}>
            <AlertIcon size={14} aria-hidden="true" /> {t.agents.driftTitle}
          </p>
          <ul className={styles.driftList}>
            {profile.drift.map((drift) => {
              // A drift of models, toolsets or plugins: badges, as everywhere else.
              const [live, repo] = [
                driftBadges(drift.field, drift.live),
                driftBadges(drift.field, drift.repo),
              ];
              if (live || repo)
                return (
                  <li key={drift.field}>
                    <span className={styles.driftModels}>
                      <code>{t.agents.field[drift.field]}</code>
                      {t.common.colon}
                      <DriftSide
                        badges={live}
                        fallback={drift.live ?? t.agents.unset[drift.field]}
                      />
                      <span className={styles.driftRepoModels}>
                        <span className={styles.muted}>
                          {t.agents.driftRepoLabel}
                          {t.common.colon}
                        </span>
                        <DriftSide
                          badges={repo}
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
            <SkillBadge key={skill} name={skill} />
          ))}
        </div>
        <h3 className={styles.blockTitle}>{t.agents.plugins}</h3>
        <div className={styles.tokens}>
          {profile.plugins.map((plugin) => (
            <span key={plugin.name} className={styles.plugin}>
              <PluginBadge name={plugin.name} />
              {/* Refusals and overruns stay as text, after the badge. */}
              {[
                ...(plugin.refusals > 0 ? [t.agents.refusals(plugin.refusals)] : []),
                ...(plugin.timeouts > 0 ? [t.agents.timeouts(plugin.timeouts)] : []),
              ].join(' · ')}
            </span>
          ))}
        </div>
        {/* Une garde dont le code peut attendre plus longtemps que son hook : le risque de l'incident #2. */}
        {profile.plugins
          .filter(
            (plugin) =>
              plugin.longestSeconds !== null &&
              hookLimit !== null &&
              plugin.longestSeconds >= hookLimit,
          )
          .map((plugin) => (
            <p key={plugin.name} className={styles.risk}>
              <AlertIcon size={12} aria-hidden="true" className={styles.riskIcon} />
              <span>
                <code>{plugin.name}</code>{' '}
                {t.agents.risk(
                  fmt.duration((plugin.longestSeconds ?? 0) * 1000),
                  fmt.duration((hookLimit ?? 0) * 1000),
                )}
              </span>
            </p>
          ))}
        <h3 className={styles.blockTitle}>{t.agents.toolsets(profile.mcp.length > 0)}</h3>
        <div className={styles.tokens}>
          {/* A `mcp-<server>` toolset of a declared server is not repeated: the server has its own badge. */}
          {profile.toolsets
            .filter((toolset) => !hiddenToolset(toolset, profile.mcp))
            .map((toolset) => (
              <ToolsetBadge key={toolset} name={toolset} />
            ))}
          {profile.mcp.map((server) => (
            <McpBadge key={server} name={server} />
          ))}
        </div>
      </section>

      <Limits limits={profile.limits} />

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
