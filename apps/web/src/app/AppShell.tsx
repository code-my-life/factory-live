import {
  AgentIcon,
  BellIcon,
  GearIcon,
  GraphIcon,
  HistoryIcon,
  IssueOpenedIcon,
  KebabHorizontalIcon,
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
import { useRef } from 'react';
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
import { useFactorySource, useSnapshot } from '../data/FactoryProvider.tsx';
import { LiveDot } from '../ui/LiveDot.tsx';
import styles from './AppShell.module.css';

interface Destination {
  to: string;
  label: string;
  icon: Icon;
}

const PRIMARY: Destination[] = [
  { to: '/', label: 'Ligne d’usine', icon: WorkflowIcon },
  { to: '/issues', label: 'Issues', icon: IssueOpenedIcon },
  { to: '/interventions', label: 'Interventions', icon: BellIcon },
  { to: '/agents', label: 'Agents', icon: AgentIcon },
];

const SECONDARY: Destination[] = [
  { to: '/health', label: 'Santé', icon: PulseIcon },
  { to: '/costs', label: 'Coûts et quotas', icon: GraphIcon },
  { to: '/history', label: 'Historique et stats', icon: HistoryIcon },
  { to: '/settings', label: 'Réglages', icon: GearIcon },
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
  const current = useIsCurrent(destination.to);
  const IconComponent = destination.icon;
  return (
    <NavList.Item as={Link} to={destination.to} aria-current={current ? 'page' : undefined}>
      <NavList.LeadingVisual>
        <IconComponent />
      </NavList.LeadingVisual>
      {destination.label}
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
  const snapshot = useSnapshot();
  const source = useFactorySource();
  const navigate = useNavigate();
  const location = useLocation();
  const moreRef = useRef<HTMLButtonElement>(null);

  const openInterventions = snapshot.interventions.length;
  const pushable = snapshot.interventions.filter((intervention) => intervention.push).length;
  const unhealthy = snapshot.health.filter((service) => service.status !== 'ok').length;
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
          <Link
            to="/"
            className={styles.brand}
            aria-label="factory-live, revenir à la ligne d’usine"
          >
            <FactoryLogo />
            <span className={styles.brandName}>factory-live</span>
          </Link>
          <p className={styles.status} aria-live="polite">
            {snapshot.factory.paused ? (
              <>
                <LiveDot tone="attention" />
                <span className={styles.statusText}>
                  En pause{snapshot.factory.pauseReason ? ` : ${snapshot.factory.pauseReason}` : ''}
                </span>
              </>
            ) : (
              <>
                <LiveDot tone="success" pulse={snapshot.factory.live} />
                <span className={styles.statusText}>
                  {snapshot.factory.live ? 'En direct' : 'Hors ligne'}
                </span>
              </>
            )}
            <span className={styles.statusDetail}>
              {snapshot.factory.running} carte{snapshot.factory.running > 1 ? 's' : ''} en cours sur{' '}
              {snapshot.factory.maxInProgress}
            </span>
          </p>
          <div className={styles.headerActions}>
            {source.kind === 'demo' ? (
              <span className={styles.demo}>
                <Label variant="attention">Démo</Label>
                {source.restart ? (
                  <IconButton
                    icon={UndoIcon}
                    aria-label="Rejouer le scénario de démonstration"
                    size="small"
                    variant="invisible"
                    onClick={() => source.restart?.()}
                  />
                ) : null}
              </span>
            ) : null}
            <Button
              leadingVisual={BellIcon}
              variant={pushable > 0 ? 'danger' : 'default'}
              size="small"
              count={openInterventions}
              onClick={() => void navigate('/interventions')}
              aria-label={`Interventions : ${openInterventions} en attente`}
            >
              <span className={styles.hideNarrow}>Interventions</span>
            </Button>
          </div>
        </div>
      </header>

      <div className={styles.body}>
        <nav className={styles.sidebar} aria-label="Navigation principale">
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
                    <LiveDot tone="attention" label={`${unhealthy} service à surveiller`} />
                  ) : null
                }
              />
              <SideNavItem destination={SECONDARY[1] as Destination} />
              <SideNavItem destination={SECONDARY[2] as Destination} />
              <SideNavItem destination={SECONDARY[3] as Destination} />
            </NavList>
            <p className={styles.sidebarFoot}>Hermès 0.22.2 · board factory</p>
          </div>
        </nav>

        <main className={styles.main} id="contenu">
          <div className={styles.content}>
            <Outlet />
          </div>
        </main>
      </div>

      <nav className={styles.tabbar} aria-label="Navigation">
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
                {destination.label.replace('Ligne d’usine', 'Ligne')}
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
              <span className={styles.tabLabel}>Plus</span>
            </button>
          </ActionMenu.Anchor>
          <ActionMenu.Overlay align="end">
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
                    {destination.label}
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
