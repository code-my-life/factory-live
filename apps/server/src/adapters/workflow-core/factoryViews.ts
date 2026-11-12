import { AcceptanceTwins, ConfigField } from '@factory-live/contracts';
import type { ConfigDrift } from '@factory-live/contracts';
import { coreDeclaredData } from '@factory-live/contracts/workflow-core';
import type { CoreDeclaredData, CoreValue } from '@factory-live/contracts/workflow-core';
import type {
  DeclaredPair,
  DeclaredViewsPort,
  GateProof,
  LoggerPort,
  RunTranscripts,
  TranscriptLine,
} from '../../application/ports.ts';
import { WorkflowCoreClient } from './client.ts';

/**
 * The factory's declared data, as factory-live's views show them (#60, decision of 2026-11-12). This module
 * is the only one that knows their names and the shape of their values: it turns the core's generic values
 * (text, link, table, status) into the recette's twins and proofs, a run's transcripts and an agent's drift.
 * It goes with the epic that moves the factory onto the core, like the twins widget's exception.
 */

const DATA = {
  twins: 'twins',
  proofs: 'gate-proofs',
  session: 'agent-session',
  claude: 'claude-sessions',
  log: 'card-log',
  drift: 'drift',
} as const;
/** The labels of the twins' values and the headers of their surfaces' table (workflow-core#120). */
const TWINS = {
  state: 'État',
  divergence: 'Divergence',
  surfaces: 'Surfaces',
  mirror: 'Miroir',
  columns: {
    id: 'Identifiant',
    label: 'Surface',
    kind: 'Sorte',
    changed: 'Touchée',
    differences: 'Différences',
    baseSha: 'Commit de base',
    basePoster: 'Image de base',
    headSha: 'Commit de tête',
    headPoster: 'Image de tête',
  },
} as const;
const TRANSCRIPT = ['Heure', 'Rôle', 'Texte', 'Outil', 'Modèle', 'Statut'] as const;
const DRIFT = ['Champ', 'Service', 'Dépôt'] as const;
const ROLES = new Set(['user', 'assistant', 'reasoning', 'tool_call', 'tool_result', 'system']);
const STATUSES = new Set(['ok', 'error', 'blocked']);

type Cell = string | number | boolean | null;
/** A table value of the core: its label, its headers and its rows. */
type Table = { type: 'table'; label: string; columns: string[]; rows: Cell[][] };

const text = (cell: Cell | undefined): string | null =>
  typeof cell === 'string' && cell !== '' ? cell : typeof cell === 'number' ? String(cell) : null;

/** A table's rows as records, by its headers; `null` when one of the expected headers is missing. */
function records<K extends string>(
  table: Table,
  headers: Record<K, string>,
): Record<K, Cell>[] | null {
  const at = Object.fromEntries(
    Object.entries(headers).map(([key, header]) => [key, table.columns.indexOf(header as string)]),
  ) as Record<K, number>;
  if (Object.values<number>(at).some((index) => index < 0)) return null;
  return table.rows.map(
    (row) =>
      Object.fromEntries(
        Object.entries<number>(at).map(([key, index]) => [key, row[index] ?? null]),
      ) as Record<K, Cell>,
  );
}

const named = (data: readonly CoreDeclaredData[], name: string) =>
  data.find((each) => each.name === name)?.values ?? [];

const tables = (values: readonly CoreValue[]): Table[] =>
  values.filter((value) => value.type === 'table') as unknown as Table[];

/** The pair of a PR, from the core's `twins` values; `null` without a pair or with values of another shape. */
function pairOf(values: readonly CoreValue[]): DeclaredPair | null {
  const state = values.find((value) => value.type === 'status' && value.label === TWINS.state);
  const divergence = values.find(
    (value) => value.type === 'text' && value.label === TWINS.divergence,
  );
  const mirror = values.find((value) => value.type === 'text' && value.label === TWINS.mirror);
  const table = tables(values).find((value) => value.label === TWINS.surfaces);
  const rows = table ? records(table, TWINS.columns) : null;
  const port = mirror?.type === 'text' ? Number(mirror.text) : Number.NaN;
  if (!state || state.type !== 'status' || !rows || !Number.isInteger(port)) return null;
  const twins = AcceptanceTwins.safeParse({
    state: state.text,
    divergence: divergence?.type === 'text' ? divergence.text : null,
    surfaces: rows.map((row) => ({
      id: row.id,
      label: row.label,
      kind: row.kind,
      changed: row.changed,
      differences: row.differences,
      base: { sha: row.baseSha, stream: null, poster: text(row.basePoster) },
      head: { sha: row.headSha, stream: null, poster: text(row.headPoster) },
    })),
  });
  return twins.success ? { twins: twins.data, mirror: port } : null;
}

/** The gate's proofs of a card: one text per rule, in their order; an unreadable folder, its error's text. */
function proofsOf(values: readonly CoreValue[]): GateProof[] {
  return values.flatMap((value, index): GateProof[] =>
    value.type === 'text' || value.type === 'status'
      ? [{ order: index + 1, rule: value.label, text: value.text }]
      : [],
  );
}

/** A transcript's table as its lines; `prefix` makes each line's id. */
function linesOf(table: Table, prefix: string): TranscriptLine[] {
  const rows = records(table, {
    at: TRANSCRIPT[0],
    role: TRANSCRIPT[1],
    text: TRANSCRIPT[2],
    toolName: TRANSCRIPT[3],
    model: TRANSCRIPT[4],
    status: TRANSCRIPT[5],
  });
  return (rows ?? []).flatMap((row, index): TranscriptLine[] => {
    const at = typeof row.at === 'string' ? Date.parse(row.at) : Number.NaN;
    const role = String(row.role);
    if (Number.isNaN(at) || !ROLES.has(role)) return [];
    const status = typeof row.status === 'string' && STATUSES.has(row.status) ? row.status : null;
    return [
      {
        id: `${prefix}:${index}`,
        at,
        role: role as TranscriptLine['role'],
        text: typeof row.text === 'string' ? row.text : null,
        toolName: text(row.toolName),
        model: text(row.model),
        status: status as TranscriptLine['status'],
      },
    ];
  });
}

/** An agent's drift: one row per field whose value in service differs from the repository's. */
function driftOf(values: readonly CoreValue[]): ConfigDrift[] {
  return tables(values).flatMap((table) =>
    (records(table, { field: DRIFT[0], live: DRIFT[1], repo: DRIFT[2] }) ?? []).flatMap(
      (row): ConfigDrift[] => {
        const field = ConfigField.safeParse(row.field);
        return field.success
          ? [{ field: field.data, live: text(row.live), repo: text(row.repo) }]
          : [];
      },
    ),
  );
}

export interface FactoryViewsOptions {
  url: string;
  secret: string;
  /** The key of the factory's workflow on the core (`factory`). */
  workflow: string;
  log: LoggerPort;
  fetch?: typeof fetch;
}

/**
 * Reads the factory's declared data from workflow-core, subject by subject, for the views of the core's
 * side. Without an answer of the core, the last answer read for the same subject stays.
 */
export class FactoryViews implements DeclaredViewsPort {
  private readonly client: WorkflowCoreClient;
  private readonly options: FactoryViewsOptions;
  private readonly last = new Map<string, CoreDeclaredData[]>();
  private readonly pairs = new Map<string, DeclaredPair>();

  constructor(options: FactoryViewsOptions) {
    this.options = options;
    this.client = new WorkflowCoreClient({
      url: options.url,
      secret: options.secret,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }

  private async read(
    subject: 'pr' | 'card' | 'run' | 'agent',
    id: string,
  ): Promise<CoreDeclaredData[]> {
    const key = `${subject}:${id}`;
    const query = `subject=${subject}&id=${encodeURIComponent(id)}`;
    try {
      const answer = await this.client.get(
        `/api/workflows/${encodeURIComponent(this.options.workflow)}/data?${query}`,
        coreDeclaredData,
      );
      this.last.set(key, answer.data);
      return answer.data;
    } catch (error) {
      this.options.log.warn(
        { subject, id, error: error instanceof Error ? error.message : String(error) },
        'données déclarées du socle illisibles : dernière réponse gardée',
      );
      return this.last.get(key) ?? [];
    }
  }

  /** The PR's pair, as the core last published it: the bench reads it (`TwinBench`, `declared`). */
  pair(repo: string, pr: number): DeclaredPair | null {
    return this.pairs.get(`${repo}#${pr}`) ?? null;
  }

  async acceptance(
    repo: string,
    pr: number,
    cardIds: readonly string[],
    head: string,
  ): Promise<GateProof[]> {
    const pair = pairOf(named(await this.read('pr', `${repo}#${pr}`), DATA.twins));
    if (pair) this.pairs.set(`${repo}#${pr}`, pair);
    else this.pairs.delete(`${repo}#${pr}`);
    const proofs: GateProof[] = [];
    // The proofs of the PR's head (`<card>@<sha7>`): the gate's proofs of that commit, as the recette shows today.
    for (const card of cardIds)
      proofs.push(
        ...proofsOf(named(await this.read('card', `${card}@${head.slice(0, 7)}`), DATA.proofs)),
      );
    return proofs;
  }

  async transcripts(runId: number): Promise<RunTranscripts | null> {
    const data = await this.read('run', String(runId));
    const session = tables(named(data, DATA.session))[0];
    const log = named(data, DATA.log).find((value) => value.type === 'text');
    return {
      hermes: session ? linesOf(session, `${runId}:hermes`) : [],
      lanes: tables(named(data, DATA.claude)).map((table, index) => ({
        name: table.label,
        entries: linesOf(table, `${runId}:lane${index}`),
      })),
      terminal: log?.type === 'text' ? log.text.split('\n') : [],
    };
  }

  async drift(agents: readonly string[]): Promise<ReadonlyMap<string, ConfigDrift[]>> {
    const drift = new Map<string, ConfigDrift[]>();
    for (const agent of agents)
      drift.set(agent, driftOf(named(await this.read('agent', agent), DATA.drift)));
    return drift;
  }
}
