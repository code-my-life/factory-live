import { createBrowserRouter, createMemoryRouter } from 'react-router';
import type { RouteObject } from 'react-router';
import { AgentsPage } from '../features/agents/AgentsPage.tsx';
import { CostsPage } from '../features/costs/CostsPage.tsx';
import { HealthPage } from '../features/health/HealthPage.tsx';
import { HistoryPage } from '../features/history/HistoryPage.tsx';
import { InterventionsPage } from '../features/interventions/InterventionsPage.tsx';
import { IssuePage } from '../features/issues/IssuePage.tsx';
import { IssuesPage } from '../features/issues/IssuesPage.tsx';
import { FactoryLinePage } from '../features/line/FactoryLinePage.tsx';
import { SettingsPage } from '../features/settings/SettingsPage.tsx';
import { AppShell } from './AppShell.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <FactoryLinePage /> },
      { path: 'issues', element: <IssuesPage /> },
      { path: 'issues/:repo/:number', element: <IssuePage /> },
      { path: 'interventions', element: <InterventionsPage /> },
      { path: 'interventions/:id', element: <InterventionsPage /> },
      { path: 'agents', element: <AgentsPage /> },
      { path: 'health', element: <HealthPage /> },
      { path: 'costs', element: <CostsPage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

/** Vues ouvrables par un simple `#jeton` quand l'adresse n'est pas maîtrisée (artifact). */
const VIEW_TOKENS: Record<string, string> = {
  ligne: '/',
  issues: '/issues',
  interventions: '/interventions',
  agents: '/agents',
  sante: '/health',
  couts: '/costs',
  historique: '/history',
  reglages: '/settings',
};

export function createAppRouter() {
  if (import.meta.env.VITE_ROUTER === 'memory') {
    const token = window.location.hash.replace(/^#/, '');
    return createMemoryRouter(routes, { initialEntries: [VIEW_TOKENS[token] ?? '/'] });
  }
  return createBrowserRouter(routes);
}
