import {
  AgentIcon,
  BellIcon,
  GearIcon,
  GraphIcon,
  HistoryIcon,
  IssueOpenedIcon,
  KebabHorizontalIcon,
  ProjectIcon,
  PulseIcon,
  UndoIcon,
  WorkflowIcon,
} from '@primer/octicons-react';
import type { Icon } from '@primer/octicons-react';
import {
  ActionList,
  ActionMenu,
  Button,
  CounterLabel,
  IconButton,
  Label,
  NavList,
} from '@primer/react';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useMatch,
  useNavigate,
  useResolvedPath,
} from 'react-router';
import {
  useConnection,
  useFactorySource,
  useLastUpdate,
  useSnapshot,
} from '../data/FactoryProvider.tsx';
import { useI18n } from '../i18n/I18nProvider.tsx';
import type { Messages } from '../i18n/fr.ts';
import { setAppBadge } from '../pwa/badge.ts';
import { Badge } from '../ui/badge/Badge.tsx';
import { Elapsed } from '../ui/Elapsed.tsx';
import { LiveDot } from '../ui/LiveDot.tsx';
import { needsWatch } from '../ui/vocabulary.ts';
import styles from './AppShell.module.css';

interface Destination {
  to: string;
  label: keyof Messages['nav'];
  icon: Icon;
}

const PRIMARY: Destination[] = [
  { to: '/', label: 'line', icon: WorkflowIcon },
  { to: '/issues', label: 'issues', icon: IssueOpenedIcon },
  { to: '/interventions', label: 'interventions', icon: BellIcon },
  { to: '/agents', label: 'agents', icon: AgentIcon },
];

const SECONDARY: Destination[] = [
  { to: '/health', label: 'health', icon: PulseIcon },
  { to: '/costs', label: 'costs', icon: GraphIcon },
  { to: '/history', label: 'history', icon: HistoryIcon },
  { to: '/settings', label: 'settings', icon: GearIcon },
];

function useIsCurrent(to: string): boolean {
  const resolved = useResolvedPath(to);
  return useMatch({ path: resolved.pathname, end: to === '/' }) !== null;
}

function SideNavItem({
  destination,
  trailing,
}: {
  destination: Destination;
  trailing?: ReactNode;
}) {
  const { t } = useI18n();
  const current = useIsCurrent(destination.to);
  const IconComponent = destination.icon;
  return (
    <NavList.Item as={Link} to={destination.to} aria-current={current ? 'page' : undefined}>
      <NavList.LeadingVisual>
        <IconComponent />
      </NavList.LeadingVisual>
      {t.nav[destination.label]}
      {trailing ? <NavList.TrailingVisual>{trailing}</NavList.TrailingVisual> : null}
    </NavList.Item>
  );
}

function FactoryLogo() {
  return (
    <svg className={styles.logo} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="4" cy="12" r="2.5" />
      <circle cx="12" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <circle cx="20" cy="12" r="2.5" />
      <path
        d="M6.2 11 9.8 7.2M6.2 13l3.6 3.8M14.2 7.2l3.6 3.8M14.2 16.8l3.6-3.8"
        fill="none"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function AppShell() {
  const { t } = useI18n();
  const snapshot = useSnapshot();
  const source = useFactorySource();
  const connection = useConnection();
  const lastUpdate = useLastUpdate();
  const navigate = useNavigate();
  const location = useLocation();
  const moreRef = useRef<HTMLButtonElement>(null);

  // Une intervention débloquée reste visible le temps du suivi, mais n'attend plus rien.
  const open = snapshot.interventions.filter((intervention) => !intervention.resolvedAt);
  const openInterventions = open.length;
  // Pastille de l'icône de l'app installée : les blocages qui t'attendent, comme le serveur la pose
  // à chaque push (notify.ts) ; la démo n'y touche pas.
  const waiting = open.filter(
    (intervention) => intervention.kind !== 'pr_approval' && intervention.kind !== 'main_red',
  ).length;
  useEffect(() => {
    if (source.kind === 'live' && connection === 'open') setAppBadge(waiting);
  }, [source.kind, connection, waiting]);
  const unhealthy = snapshot.health.filter((service) => needsWatch(service.status)).length;
  const activeIssues = snapshot.issues.filter(
    (issue) => !['done', 'stopped'].includes(issue.status),
  ).length;
  const secondaryCurrent = SECONDARY.some((destination) =>
    location.pathname.startsWith(destination.to),
  );

  return (
    <div>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.brand} aria-label={t.shell.home}>
            <FactoryLogo />
            <span className={styles.brandName}>factory-live</span>
          </Link>
          <p className={styles.status} aria-live="polite">
            {connection === 'lost' ? (
              <>
                <LiveDot tone="danger" />
                <span className={styles.statusText}>{t.shell.offline}</span>
                <span className={styles.statusDetail}>
                  {lastUpdate !== null ? (
                    <>
                      {t.shell.lastState}{' '}
                      <Elapsed since={new Date(lastUpdate).toISOString()} mode="age" />
                    </>
                  ) : (
                    t.shell.unreachable
                  )}
                </span>
              </>
            ) : connection === 'connecting' ? (
              <>
                <LiveDot tone="muted" />
                <span className={styles.statusText}>{t.shell.connecting}</span>
              </>
            ) : (
              <>
                {snapshot.factory.paused ? (
                  <>
                    <LiveDot tone="attention" />
                    <span className={styles.statusText}>
                      {t.shell.paused(snapshot.factory.pauseReason)}
                    </span>
                  </>
                ) : snapshot.factory.live ? (
                  <>
                    <LiveDot tone="success" pulse />
                    <span className={styles.statusText}>{t.shell.live}</span>
                  </>
                ) : (
                  <>
                    <LiveDot tone="attention" />
                    <span className={styles.statusText}>{t.shell.silent}</span>
                  </>
                )}
                <span className={styles.statusDetail}>
                  {t.shell.running(snapshot.factory.running, snapshot.factory.maxInProgress)}
                </span>
              </>
            )}
          </p>
          <div className={styles.headerActions}>
            {source.kind === 'demo' ? (
              <span className={styles.demo}>
                <Label variant="attention">{t.shell.demo}</Label>
                {source.restart ? (
                  <IconButton
                    icon={UndoIcon}
                    aria-label={t.shell.replayDemo}
                    size="small"
                    variant="invisible"
                    onClick={() => source.restart?.()}
                  />
                ) : null}
              </span>
            ) : null}
            {/* Un raccourci, pas une action destructrice : le bouton par défaut, le compte dit l'urgence. */}
            <Button
              leadingVisual={BellIcon}
              size="small"
              count={openInterventions}
              onClick={() => void navigate('/interventions')}
              aria-label={t.shell.interventionsWaiting(openInterventions)}
            >
              <span className={styles.hideNarrow}>{t.nav.interventions}</span>
            </Button>
          </div>
        </div>
      </header>

      <div className={styles.body}>
        <nav className={styles.sidebar} aria-label={t.nav.main}>
          <div className={styles.sidebarInner}>
            <NavList>
              <SideNavItem destination={PRIMARY[0] as Destination} />
              <SideNavItem
                destination={PRIMARY[1] as Destination}
                trailing={<CounterLabel>{activeIssues}</CounterLabel>}
              />
              <SideNavItem
                destination={PRIMARY[2] as Destination}
                trailing={
                  openInterventions > 0 ? (
                    <CounterLabel variant="primary">{openInterventions}</CounterLabel>
                  ) : null
                }
              />
              <SideNavItem destination={PRIMARY[3] as Destination} />
              <NavList.Divider />
              <SideNavItem
                destination={SECONDARY[0] as Destination}
                trailing={
                  unhealthy > 0 ? (
                    <LiveDot tone="attention" label={t.shell.servicesToWatch(unhealthy)} />
                  ) : null
                }
              />
              <SideNavItem destination={SECONDARY[1] as Destination} />
              <SideNavItem destination={SECONDARY[2] as Destination} />
              <SideNavItem destination={SECONDARY[3] as Destination} />
            </NavList>
            <p className={styles.sidebarFoot}>
              <Badge label={t.shell.board} labelIcon={ProjectIcon} value="factory" code />
            </p>
          </div>
        </nav>

        <main className={styles.main} id="contenu">
          <div className={styles.content}>
            <Outlet />
          </div>
        </main>
      </div>

      <nav className={styles.tabbar} aria-label={t.nav.tabs}>
        {PRIMARY.map((destination) => {
          const IconComponent = destination.icon;
          const badge =
            destination.to === '/interventions' && openInterventions > 0 ? openInterventions : null;
          return (
            <NavLink
              key={destination.to}
              to={destination.to}
              end={destination.to === '/'}
              className={styles.tab}
            >
              <span className={styles.tabIcon}>
                <IconComponent size={20} />
                {badge !== null ? <span className={styles.tabBadge}>{badge}</span> : null}
              </span>
              <span className={styles.tabLabel}>
                {destination.label === 'line' ? t.nav.lineShort : t.nav[destination.label]}
              </span>
            </NavLink>
          );
        })}
        <ActionMenu anchorRef={moreRef}>
          <ActionMenu.Anchor>
            <button
              ref={moreRef}
              type="button"
              className={styles.tab}
              aria-current={secondaryCurrent ? 'page' : undefined}
            >
              <span className={styles.tabIcon}>
                <KebabHorizontalIcon size={20} />
                {unhealthy > 0 ? <span className={styles.tabDot} /> : null}
              </span>
              <span className={styles.tabLabel}>{t.nav.more}</span>
            </button>
          </ActionMenu.Anchor>
          {/* Au-dessus du bouton : la barre est fixée en bas de l'écran, et en dessous (dans la page),
              le menu s'ouvrait hors de l'écran tant qu'on n'avait pas défilé jusqu'en bas. */}
          <ActionMenu.Overlay align="end" side="outside-top">
            <ActionList>
              {SECONDARY.map((destination) => {
                const IconComponent = destination.icon;
                return (
                  <ActionList.Item
                    key={destination.to}
                    onSelect={() => void navigate(destination.to)}
                  >
                    <ActionList.LeadingVisual>
                      <IconComponent />
                    </ActionList.LeadingVisual>
                    {t.nav[destination.label]}
                  </ActionList.Item>
                );
              })}
            </ActionList>
          </ActionMenu.Overlay>
        </ActionMenu>
      </nav>
    </div>
  );
}
