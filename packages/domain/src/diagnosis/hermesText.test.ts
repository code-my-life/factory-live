import { describe, expect, it } from 'vitest';
import {
  HOOK_TIMEOUT_MESSAGE,
  budgetOf,
  classifyToolResult,
  isProtocolViolation,
  isRefusal,
  logFactOf,
  normalizedRefusal,
  parseLogLine,
  pluginOfModule,
  providerFailureOf,
  quote,
  resumeSessionOf,
  runtimeOf,
  str,
  wasNudged,
} from './hermesText.ts';

describe('résultats d’outils, tels qu’Hermès les écrit', () => {
  it('reconnaît le refus d’un hook en dépassement, au texte exact et seulement lui', () => {
    expect(classifyToolResult(`{"error": "${HOOK_TIMEOUT_MESSAGE}"}`)).toEqual({
      kind: 'hook_timeout',
    });
    // kanban_show d'une carte bloquée cite ce texte : ce n'est pas un refus.
    const quoting = JSON.stringify({ task: { reason: `bloqué par '${HOOK_TIMEOUT_MESSAGE}'` } });
    expect(classifyToolResult(quoting)).toEqual({ kind: 'ok' });
  });

  it('reconnaît une garde qui plante, une garde qui refuse, le contrôle de PR', () => {
    expect(
      classifyToolResult(
        '{"error": "pre_tool_call plugin callback guard raised KeyError: \'command\'"}',
      ),
    ).toEqual({ kind: 'hook_raised', callback: 'guard', error: "KeyError: 'command'" });
    expect(
      classifyToolResult(
        '{"error": "coder-guard : git add . / -A interdit : ajoute les fichiers un par un."}',
      ),
    ).toEqual({
      kind: 'guard',
      plugin: 'coder-guard',
      message: 'git add . / -A interdit : ajoute les fichiers un par un.',
    });
    expect(
      classifyToolResult(
        '{"error": "gate-readonly : redirection vers /tmp/x refusée, écris sous evidence/."}',
      ),
    ).toMatchObject({ kind: 'guard', plugin: 'gate-readonly' });
    expect(
      classifyToolResult(
        '{"error": "PR acceptance missing: No repository-required checks are configured; explicitly use a local-only contract."}',
      ),
    ).toEqual({
      kind: 'pr_acceptance',
      classification: 'missing',
      detail: 'No repository-required checks are configured; explicitly use a local-only contract.',
    });
    expect(classifyToolResult('{"error": "path required"}')).toEqual({
      kind: 'error',
      message: 'path required',
    });
  });

  it('reconnaît le plafond d’un outil et une commande arrêtée par son délai', () => {
    expect(classifyToolResult("Error executing tool 'terminal': timed out after 420.0s")).toEqual({
      kind: 'tool_deadline',
      tool: 'terminal',
      seconds: 420,
    });
    expect(
      classifyToolResult(
        '{"output": "[Command timed out after 900s]", "exit_code": 124, "error": null}',
      ),
    ).toEqual({ kind: 'command_timeout', seconds: 900 });
    expect(classifyToolResult('{"output": "", "exit_code": 124, "error": null}')).toEqual({
      kind: 'command_timeout',
      seconds: null,
    });
  });

  it('classe un contenu coupé par son début (refus) ou par sa fin (code de sortie)', () => {
    expect(
      classifyToolResult('{"error": "coder-guard : commit refusé, corrige puis recom'),
    ).toMatchObject({
      kind: 'guard',
      plugin: 'coder-guard',
    });
    expect(
      classifyToolResult('{"output": "npm ERR …", "exit_code": 124, "error": null'),
    ).toMatchObject({
      kind: 'command_timeout',
    });
    expect(classifyToolResult('{"output": "coupé sans fin')).toEqual({ kind: 'ok' });
    expect(classifyToolResult('{"error": "\\')).toEqual({ kind: 'ok' });
    expect(classifyToolResult('[1, 2]')).toEqual({ kind: 'ok' });
    expect(classifyToolResult('texte libre')).toEqual({ kind: 'ok' });
  });

  it('compte comme refus ce qui empêche d’agir, pas une erreur ordinaire', () => {
    expect(isRefusal({ kind: 'hook_timeout' })).toBe(true);
    expect(isRefusal({ kind: 'guard', plugin: 'coder-guard', message: 'x' })).toBe(true);
    expect(isRefusal({ kind: 'error', message: 'x' })).toBe(false);
  });

  it('rapproche deux refus qui ne diffèrent que par un chemin ou un nombre', () => {
    expect(normalizedRefusal('redirection vers /tmp/a.txt refusée, 3 fois\nsuite')).toBe(
      normalizedRefusal('redirection vers /tmp/b.txt refusée, 4 fois'),
    );
  });

  it('cite tel quel, secrets masqués, coupé à 300 caractères', () => {
    expect(quote(null)).toBeNull();
    expect(quote('')).toBeNull();
    expect(quote('jeton ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')).not.toContain('ghp_ABCDEF');
    expect(quote('x'.repeat(400))?.length).toBe(300);
    expect(str(12)).toBe('');
    expect(str('ok')).toBe('ok');
  });
});

describe('erreurs des runs', () => {
  it('reconnaît une sortie sans appel kanban et la relance d’Hermès', () => {
    expect(
      isProtocolViolation(
        'worker exited cleanly (rc=0) without kanban_complete, kanban_block or kanban_request_review \u2014 protocol violation. If…',
      ),
    ).toBe(true);
    expect(isProtocolViolation(null)).toBe(false);
    expect(
      wasNudged(
        '⚠️ Kanban worker tried to exit without a terminal board call (…) nudging to finish',
      ),
    ).toBe(true);
    expect(wasNudged(undefined)).toBe(false);
  });

  it('lit le budget de tours, la durée maximale, la session d’un run', () => {
    expect(
      budgetOf(
        'Iteration budget exhausted (150/150) \u2014 task could not complete within the allowed iterations',
      ),
    ).toEqual({ used: 150, max: 150 });
    expect(budgetOf(null)).toBeNull();
    expect(runtimeOf('elapsed 7300s > limit 7200s')).toEqual({ elapsed: 7300, limit: 7200 });
    expect(runtimeOf('autre chose')).toBeNull();
    expect(
      resumeSessionOf('Resume this session with: hermes --resume 20261029_091353_0a2b3f -p coder'),
    ).toBe('20261029_091353_0a2b3f');
    expect(resumeSessionOf(null)).toBeNull();
  });

  it('reconnaît un fournisseur muet ou une chaîne de repli en échec', () => {
    expect(
      providerFailureOf("Sending after interrupt: 'Turn made no progress for 669s; aborting"),
    ).toEqual({
      mode: 'stalled',
      seconds: 669,
    });
    expect(
      providerFailureOf(
        'every provider in the fallback chain kept failing over, so the turn stopped',
      ),
    ).toEqual({ mode: 'failing', seconds: null });
    expect(providerFailureOf('Duration: 35m 37s')).toBeNull();
    expect(providerFailureOf(null)).toBeNull();
  });
});

describe('journal d’Hermès', () => {
  const line = (message: string, session = '') =>
    `2026-10-29 09:46:10,160 WARNING${session ? ` [${session}]` : ''} hermes_cli.plugins: ${message}`;

  it('lit l’en-tête d’une ligne, avec ou sans session', () => {
    expect(parseLogLine(line('x', '20261029_093652_fc383d'))).toEqual({
      wallClock: '2026-10-29 09:46:10',
      millis: 160,
      level: 'WARNING',
      sessionId: '20261029_093652_fc383d',
      logger: 'hermes_cli.plugins',
      message: 'x',
    });
    expect(parseLogLine('Traceback (most recent call last):')).toBeNull();
  });

  it('reconnaît chaque ligne cataloguée, et seulement elles', () => {
    const fact = (message: string) => {
      const parsed = parseLogLine(line(message));
      return parsed ? logFactOf(parsed) : null;
    };
    expect(
      fact("Hook 'pre_tool_call' callback pre_tool timed out after 30s \u2014 skipping"),
    ).toMatchObject({
      kind: 'hook_timeout',
      hook: 'pre_tool_call',
      callback: 'pre_tool',
      seconds: 30,
    });
    expect(
      fact(
        "Hook 'pre_tool_call' callback pre_tool skipped after previous timeout or while still running",
      ),
    ).toMatchObject({ kind: 'hook_skipped', callback: 'pre_tool' });
    expect(
      fact(
        "Hook 'pre_tool_call' callback guard (hermes_plugins.gate_readonly) skipped: 3 abandoned worker(s) still running \u2014 the plugin is hung",
      ),
    ).toMatchObject({ kind: 'hook_abandoned', module: 'hermes_plugins.gate_readonly', count: 3 });
    expect(
      fact(
        "Hook 'pre_tool_call' callback guard raised: boom (hook provides: args, tool_name; identical failures are logged at DEBUG from now on)",
      ),
    ).toMatchObject({ kind: 'hook_raised', callback: 'guard', detail: 'boom' });
    expect(
      fact("Failed to load plugin 'factory-notify': No module named 'factory_issue'"),
    ).toMatchObject({
      kind: 'plugin_load_failed',
      plugin: 'factory-notify',
    });
    expect(fact('kanban stop-loop nudge issued (attempt 2) task=t_665ba7d7')).toMatchObject({
      kind: 'stop_nudge',
      count: 2,
      detail: 't_665ba7d7',
    });
    expect(
      fact('Turn ended: reason=text_response(finish_reason=stop) model=auto api_calls=37/400'),
    ).toMatchObject({ kind: 'turn_ended' });
    expect(fact('sequential tool terminal timed out after 420.0s')).toMatchObject({
      kind: 'tool_deadline',
      detail: 'terminal',
      seconds: 420,
    });
    expect(
      fact(
        'API call failed (attempt 2/3) error_type=rate_limit thread=t1 provider=freellmapi base_url=http://x model=auto summary=429',
      ),
    ).toMatchObject({ kind: 'api_failed', detail: 'rate_limit', plugin: 'freellmapi' });
    expect(fact('tool terminal completed (30.01s, 72 chars)')).toBeNull();
  });

  it('nomme un plugin d’après son module Python', () => {
    expect(pluginOfModule('hermes_plugins.coder_guard')).toBe('coder-guard');
    expect(pluginOfModule(null)).toBeNull();
    expect(pluginOfModule('')).toBeNull();
  });
});
