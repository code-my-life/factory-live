// Capture un incident réel de la factory pour les tests du diagnostic : la carte, ses runs, ses
// événements, l'essentiel de ses sessions et du journal d'Hermès, lus en lecture seule et anonymisés.
//
//   node scripts/capture-incident.mjs <carte> --name <cas> [--anchor <événement>] [--board factory]
//
// Écrit sur la sortie standard l'entrée à ajouter à `INCIDENTS`
// (packages/domain/src/diagnosis/incidents.test-helpers.ts), avec son nom dans `IncidentName`.
// Relire avant de commiter : rien de propre à ce PC ne doit rester (check-text le vérifie aussi).
import { existsSync, readFileSync } from 'node:fs';
import { homedir, hostname, userInfo } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: 'string' },
    anchor: { type: 'string' },
    board: { type: 'string', default: 'factory' },
  },
});
const card = positionals[0];
if (!card || !/^t_[0-9a-f]{8}$/.test(card) || !values.name) {
  console.error(
    'Usage : node scripts/capture-incident.mjs <carte> --name <cas> [--anchor <événement>]',
  );
  process.exit(2);
}

const HERMES = process.env.HERMES_HOME ?? join(homedir(), '.hermes');
const TIME_ZONE = process.env.HERMES_TZ ?? 'Europe/Paris';
const CLIP = 240;

/** Ni dossier personnel, ni nom d'utilisateur, ni nom de la machine, ni jeton. */
function anon(text) {
  if (text === null || text === undefined) return text;
  const user = userInfo().username;
  return String(text)
    .replaceAll(homedir(), '/home/user')
    .replaceAll(hostname(), 'host')
    .replace(new RegExp(`\\b${user}\\b`, 'g'), 'user')
    .replace(/(ghs_|ghp_|gho_|ghu_|ghr_|github_pat_|sk-)[A-Za-z0-9_-]{8,}/g, '$1***');
}
const clip = (text, size = CLIP) => {
  const clean = anon(text ?? '');
  return clean.length <= size ? clean : clean.slice(0, size);
};
/** Le début et la fin d'un long contenu : le code de sortie d'une commande est à la fin. */
const headTail = (text, size = CLIP) => {
  const clean = anon(text ?? '');
  return clean.length <= size ? clean : `${clean.slice(0, size - 80)}…${clean.slice(-79)}`;
};
/** La fin d'une sortie de worker : c'est là qu'Hermès dit pourquoi le tour s'est arrêté. */
const tail = (text, size = 300) => {
  const clean = anon(text ?? '');
  return clean.length <= size ? clean : clean.slice(-size);
};
const json = (value) => {
  try {
    return JSON.parse(value ?? '');
  } catch {
    return null;
  }
};

const readOnly = (path) => new DatabaseSync(path, { readOnly: true });
const kanban = readOnly(join(HERMES, 'kanban', 'boards', values.board, 'kanban.db'));
const states = new Map();
function state(profile) {
  if (!states.has(profile)) {
    const path = join(HERMES, 'profiles', profile, 'state.db');
    states.set(profile, existsSync(path) ? readOnly(path) : null);
  }
  return states.get(profile);
}

const USED_KINDS = new Set(
  'created unblocked reclaimed blocked gave_up protocol_violation crashed timed_out rate_limited spawn_failed block_loop_detected pr_acceptance respawn_guarded review_requested changes_requested completed promoted assigned status'.split(
    ' ',
  ),
);
const KEEP_PAYLOAD = new Set(
  'reason kind recurrences error failures exit_kind exit_code protocol_violations trigger_outcome classification terminal_provider elapsed_seconds limit_seconds sticky limit worker_output ok detail manual protocol_violation'.split(
    ' ',
  ),
);
const FAILURES = new Set(['blocked', 'gave_up', 'block_loop_detected', 'timed_out', 'crashed']);

const allEvents = kanban
  .prepare('SELECT * FROM task_events WHERE task_id = ? ORDER BY id')
  .all(card)
  .filter((event) => USED_KINDS.has(event.kind));
const anchor = values.anchor
  ? allEvents.find((event) => event.id === Number(values.anchor))
  : allEvents.filter((event) => FAILURES.has(event.kind)).at(-1);
if (values.anchor && !anchor) {
  console.error(`Événement ${values.anchor} introuvable sur ${card}.`);
  process.exit(1);
}
const until = anchor ? anchor.id : Number.POSITIVE_INFINITY;
const now = anchor ? anchor.created_at + 3 : Math.floor(Date.now() / 1000);

// Les retenues active_pr se répètent toutes les minutes : les trois premières et la dernière suffisent.
const guarded = allEvents.filter((event) => event.kind === 'respawn_guarded' && event.id <= until);
const keepGuarded = new Set(
  [...guarded.slice(0, 3), ...guarded.slice(-1)].map((event) => event.id),
);
const events = allEvents
  .filter((event) => event.id <= until)
  .filter((event) => event.kind !== 'respawn_guarded' || keepGuarded.has(event.id))
  .map((event) => {
    const payload = json(event.payload) ?? {};
    return {
      id: event.id,
      taskId: card,
      runId: event.run_id,
      kind: event.kind,
      payload: Object.fromEntries(
        Object.entries(payload)
          .filter(([key]) => KEEP_PAYLOAD.has(key))
          .map(([key, value]) => [
            key,
            typeof value === 'string'
              ? key === 'worker_output'
                ? tail(value)
                : clip(value, 300)
              : value,
          ]),
      ),
      createdAt: event.created_at,
    };
  });

const runs = kanban
  .prepare('SELECT * FROM task_runs WHERE task_id = ? AND started_at <= ? ORDER BY id')
  .all(card, anchor ? anchor.created_at : Number.MAX_SAFE_INTEGER)
  .map((run) => {
    const metadata = json(run.metadata) ?? {};
    const kept = {};
    for (const key of [
      'worker_output',
      'protocol_violation',
      'worker_session_id',
      'exit_code',
      'branch',
      'pr_url',
    ])
      if (key in metadata)
        kept[key] =
          typeof metadata[key] === 'string'
            ? key === 'worker_output'
              ? tail(metadata[key])
              : clip(metadata[key], 300)
            : metadata[key];
    return {
      id: run.id,
      taskId: card,
      profile: run.profile,
      status: run.status,
      outcome: run.outcome,
      startedAt: run.started_at,
      endedAt: run.ended_at,
      summary: clip(run.summary, 200) || null,
      metadata: kept,
      error: clip(run.error, 300) || null,
      raw: { metadata, error: run.error },
    };
  });

/** La session d'un run, jamais devinée : la même règle que le serveur (`SessionReader.runFacts`). */
function sessionOf(db, run) {
  const resume = /hermes --resume (\d{8}_\d{6}_[0-9a-f]{6}) -p \S+/;
  const candidates = [
    run.raw.metadata.worker_session_id,
    resume.exec(run.raw.error ?? '')?.[1],
    resume.exec(run.raw.metadata.worker_output ?? '')?.[1],
  ];
  for (const id of candidates)
    if (id && db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(id)) return id;
  const prompt = `work kanban task ${card}`;
  const rows = db
    .prepare(
      `SELECT s.id FROM sessions s WHERE s.started_at BETWEEN ? AND ? AND substr((
         SELECT m.content FROM messages m WHERE m.session_id = s.id AND m.role = 'user'
         ORDER BY m.id LIMIT 1), 1, ?) = ?`,
    )
    .all(run.startedAt - 5, run.startedAt + 120, prompt.length, prompt);
  return rows.length === 1 ? rows[0].id : null;
}

const interesting = (content) => {
  const text = (content ?? '').trim();
  return (
    text.startsWith('{"error"') ||
    text.startsWith('Error executing tool') ||
    text.includes('"exit_code": 124')
  );
};

/** Les appels et résultats utiles d'une session : refus, erreurs, commits, les 10 derniers, un appel d'édition par fichier. */
function sessionFacts(db, id, runId) {
  const rows = db
    .prepare(
      'SELECT role, tool_name, tool_call_id, tool_calls, content, timestamp FROM messages WHERE session_id = ? ORDER BY id',
    )
    .all(id);
  const calls = new Map();
  for (const row of rows) {
    if (row.role !== 'assistant' || !row.tool_calls) continue;
    for (const call of json(row.tool_calls) ?? []) {
      const args = json(call?.function?.arguments) ?? {};
      const input = args.command ?? args.path ?? args.name ?? null;
      const callId = call.id ?? call.call_id ?? null;
      calls.set(callId, {
        at: Math.round(row.timestamp * 1000) / 1000,
        tool: call?.function?.name ?? '?',
        input: typeof input === 'string' ? clip(input, 160) : null,
        callId,
      });
    }
  }
  const results = rows.filter((row) => row.role === 'tool');
  const keep = new Set(results.map((_, index) => index).slice(-10));
  results.forEach((row, index) => {
    const call = calls.get(row.tool_call_id);
    if (interesting(row.content) || /\bgit\s+(commit|push)\b/.test(call?.input ?? ''))
      keep.add(index);
  });
  const used = new Set();
  const outResults = [...keep]
    .sort((left, right) => left - right)
    .map((index) => {
      const row = results[index];
      used.add(row.tool_call_id);
      return {
        at: Math.round(row.timestamp * 1000) / 1000,
        tool: row.tool_name ?? '?',
        callId: row.tool_call_id,
        content: interesting(row.content) ? headTail(row.content) : clip(row.content, 120),
      };
    });
  const edited = new Map();
  for (const call of calls.values())
    if (
      (call.tool === 'write_file' || call.tool === 'patch') &&
      call.input &&
      !edited.has(call.input)
    )
      edited.set(call.input, call);
  const outCalls = [
    ...[...calls.values()].filter((call) => used.has(call.callId)),
    ...[...edited.values()].filter((call) => !used.has(call.callId)),
  ].sort((left, right) => left.at - right.at);
  return { id, runId, calls: outCalls, results: outResults };
}

const sessions = runs.flatMap((run) => {
  const db = state(run.profile);
  const id = db ? sessionOf(db, run) : null;
  return id ? [sessionFacts(db, id, run.id)] : [];
});

/** L'heure murale d'un instant dans le fuseau d'Hermès, au format de son journal. */
const wall = (seconds) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(seconds * 1000));
const offset = (seconds) => {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, timeZoneName: 'longOffset' })
    .formatToParts(new Date(seconds * 1000))
    .find((part) => part.type === 'timeZoneName')?.value;
  return name === 'GMT' ? '+00:00' : (name ?? 'GMT+00:00').replace('GMT', '');
};

const LOG_KEEP =
  /Hook '|stop-loop nudge|Turn ended|Failed to load plugin|sequential tool .* timed out|API call failed/;
const logLines = runs.flatMap((run) => {
  const from = wall(run.startedAt - 60);
  const to = wall((run.endedAt ?? now) + 60);
  return ['agent.log.1', 'agent.log'].flatMap((name) => {
    const path = join(HERMES, 'profiles', run.profile, 'logs', name);
    if (!existsSync(path)) return [];
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => {
        const stamp = line.slice(0, 19);
        return stamp >= from && stamp <= to && LOG_KEEP.test(line);
      })
      .map((line) => anon(line).slice(0, 400));
  });
});

const task = kanban.prepare('SELECT * FROM tasks WHERE id = ?').get(card);
// L'état de la carte au moment de l'événement raconté, pas celui d'aujourd'hui.
const status =
  anchor?.kind === 'block_loop_detected'
    ? 'triage'
    : anchor && FAILURES.has(anchor.kind)
      ? 'blocked'
      : task.status;
const blockKind =
  anchor?.kind === 'blocked' ? (json(anchor.payload)?.kind ?? null) : task.block_kind;
const anchorRun = runs.find((run) => run.id === anchor?.run_id) ?? runs.at(-1);
const entry = {
  task: {
    id: task.id,
    title: anon(task.title),
    assignee: anchorRun?.profile ?? task.assignee,
    createdAt: task.created_at,
    workspacePath: anon(task.workspace_path),
    maxRuntimeSeconds: task.max_runtime_seconds ?? null,
    skills: json(task.skills) ?? [],
    status,
    blockKind,
    blockRecurrences: task.block_recurrences ?? 0,
    branchName: task.branch_name ?? null,
  },
  runs: runs.map(({ raw, ...run }) => run),
  events,
  anchorId: anchor?.id ?? null,
  now,
  sessions,
  logLines: [...new Set(logLines)],
  tzOffset: offset(anchor?.created_at ?? now),
};

const body = JSON.stringify(entry, null, 2).replaceAll(String.fromCharCode(0x2014), '\\u2014');
console.log(
  `  // ${card}${anchor ? `, événement ${anchor.id} (${anchor.kind})` : ''} : à relire, blockRecurrences compris.`,
);
console.log(`  ${values.name}: ${body.replaceAll('\n', '\n  ')},`);
