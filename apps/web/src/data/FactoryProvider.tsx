import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type {
  HistoryStats,
  IssueDetail,
  IssueKey,
  ProfileView,
  Snapshot,
  TranscriptView,
  UsageReport,
} from '@factory-live/contracts';
import type { FactoryDataSource, UsagePeriod } from './source.ts';

const FactorySourceContext = createContext<FactoryDataSource | null>(null);

export function FactoryProvider({
  source,
  children,
}: {
  source: FactoryDataSource;
  children: ReactNode;
}) {
  return <FactorySourceContext.Provider value={source}>{children}</FactorySourceContext.Provider>;
}

export function useFactorySource(): FactoryDataSource {
  const source = useContext(FactorySourceContext);
  if (!source) throw new Error('useFactorySource doit être utilisé sous FactoryProvider');
  return source;
}

function useSourceValue<T>(read: (source: FactoryDataSource) => T): T {
  const source = useFactorySource();
  const subscribe = useCallback((listener: () => void) => source.subscribe(listener), [source]);
  return useSyncExternalStore(subscribe, () => read(source));
}

export function useSnapshot(): Snapshot {
  return useSourceValue((source) => source.getSnapshot());
}

export function useIssueDetail(key: IssueKey): IssueDetail | null {
  return useSourceValue((source) => source.getIssueDetail(key));
}

export function useTranscripts(runId: number | null): readonly TranscriptView[] | null {
  return useSourceValue((source) => (runId === null ? null : source.getTranscripts(runId)));
}

export function useProfiles(): readonly ProfileView[] {
  return useSourceValue((source) => source.getProfiles());
}

export function useUsage(periodDays: UsagePeriod): UsageReport {
  return useSourceValue((source) => source.getUsage(periodDays));
}

export function useHistory(): HistoryStats {
  return useSourceValue((source) => source.getHistory());
}
