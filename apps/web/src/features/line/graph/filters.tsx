import type { IssueStatus, IssueType } from '@factory-live/contracts';
import { IssueType as IssueTypes, IssueStatus as IssueStatuses } from '@factory-live/contracts';
import { SearchIcon, XIcon } from '@primer/octicons-react';
import { ActionList, ActionMenu, Button, TextInput } from '@primer/react';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import type { LineIssue } from './model.ts';
import styles from './graph.module.css';

/** The quick search: by issue, then by type, state, repository or model provider. */
export interface Filters {
  query: string;
  types: ReadonlySet<IssueType>;
  states: ReadonlySet<IssueStatus>;
  repos: ReadonlySet<string>;
  providers: ReadonlySet<string>;
}

export const NO_FILTERS: Filters = {
  query: '',
  types: new Set(),
  states: new Set(),
  repos: new Set(),
  providers: new Set(),
};

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** The models behind an issue's agent: its own, and the one of the CLI lane it drives. */
const modelsOf = (item: LineIssue) =>
  [item.agent?.model, item.agent?.laneModel].filter((model) => model != null);

export const filtering = (filters: Filters): boolean =>
  filters.query.trim() !== '' ||
  filters.types.size + filters.states.size + filters.repos.size + filters.providers.size > 0;

/** Whether the search keeps an issue: every word of the query, and every chosen criterion. */
export function matches(
  item: LineIssue,
  filters: Filters,
  typeName: (type: IssueType) => string,
): boolean {
  const { issue, agent } = item;
  if (filters.types.size > 0 && !(issue.type && filters.types.has(issue.type))) return false;
  if (filters.states.size > 0 && !filters.states.has(issue.status)) return false;
  if (filters.repos.size > 0 && !filters.repos.has(issue.repo)) return false;
  if (
    filters.providers.size > 0 &&
    !modelsOf(item).some((model) => model.provider && filters.providers.has(model.provider))
  )
    return false;
  const query = fold(filters.query.trim());
  if (!query) return true;
  const haystack = fold(
    [
      issue.key,
      issue.title,
      issue.type ? typeName(issue.type) : '',
      agent?.profile ?? '',
      ...modelsOf(item).map((model) => `${model.provider ?? ''} ${model.model}`),
    ].join(' '),
  );
  return query.split(/\s+/).every((word) => haystack.includes(word));
}

export function GraphFilters({
  items,
  filters,
  onChange,
  found,
}: {
  items: readonly LineIssue[];
  filters: Filters;
  onChange: (filters: Filters) => void;
  /** How many issues the search keeps; `null` when nothing is filtered. */
  found: number | null;
}) {
  const { t } = useI18n();
  const repos = [...new Set(items.map((item) => item.issue.repo))].sort();
  const providers = [
    ...new Set(items.flatMap((item) => modelsOf(item).flatMap((model) => model.provider ?? []))),
  ].sort();
  const toggle = <T,>(set: ReadonlySet<T>, value: T): ReadonlySet<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };
  return (
    <div className={styles.filters} role="search">
      <TextInput
        className={styles.search}
        leadingVisual={SearchIcon}
        placeholder={t.line.graph.searchPlaceholder}
        aria-label={t.line.graph.search}
        value={filters.query}
        onChange={(event) => onChange({ ...filters, query: event.target.value })}
        trailingAction={
          filters.query ? (
            <TextInput.Action
              onClick={() => onChange({ ...filters, query: '' })}
              icon={XIcon}
              aria-label={t.line.graph.clearSearch}
            />
          ) : undefined
        }
        size="small"
      />
      <FilterMenu
        label={t.line.graph.filter.type}
        options={IssueTypes.options.map((type) => ({ value: type, name: t.issueType[type] }))}
        selected={filters.types}
        onToggle={(value) => onChange({ ...filters, types: toggle(filters.types, value) })}
      />
      <FilterMenu
        label={t.line.graph.filter.state}
        options={IssueStatuses.options.map((status) => ({
          value: status,
          name: t.issueStatus[status],
        }))}
        selected={filters.states}
        onToggle={(value) => onChange({ ...filters, states: toggle(filters.states, value) })}
      />
      <FilterMenu
        label={t.line.graph.filter.repo}
        options={repos.map((repo) => ({ value: repo, name: repo }))}
        selected={filters.repos}
        onToggle={(value) => onChange({ ...filters, repos: toggle(filters.repos, value) })}
      />
      <FilterMenu
        label={t.line.graph.filter.model}
        options={providers.map((provider) => ({ value: provider, name: provider }))}
        selected={filters.providers}
        onToggle={(value) => onChange({ ...filters, providers: toggle(filters.providers, value) })}
      />
      {found !== null ? (
        <span className={styles.found} aria-live="polite">
          {t.line.graph.found(found, items.length)}
          <Button
            className={styles.control}
            variant="invisible"
            size="small"
            onClick={() => onChange(NO_FILTERS)}
          >
            {t.line.graph.clear}
          </Button>
        </span>
      ) : null}
    </div>
  );
}

function FilterMenu<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly { value: T; name: string }[];
  selected: ReadonlySet<T>;
  onToggle: (value: T) => void;
}) {
  return (
    <ActionMenu>
      <ActionMenu.Button
        className={styles.control}
        size="small"
        variant={selected.size > 0 ? 'default' : 'invisible'}
      >
        {label}
        {selected.size > 0 ? ` · ${selected.size}` : ''}
      </ActionMenu.Button>
      <ActionMenu.Overlay width="auto">
        <ActionList selectionVariant="multiple" aria-label={label}>
          {options.map((option) => (
            <ActionList.Item
              key={option.value}
              selected={selected.has(option.value)}
              onSelect={(event) => {
                event.preventDefault();
                onToggle(option.value);
              }}
            >
              {option.name}
            </ActionList.Item>
          ))}
        </ActionList>
      </ActionMenu.Overlay>
    </ActionMenu>
  );
}
