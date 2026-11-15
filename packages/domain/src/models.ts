export interface ModelRef {
  model: string;
  provider: string;
  source: 'live' | 'session' | 'override' | 'config';
}

export interface ModelEvidence {
  live: { model: string; provider: string } | null;
  session: readonly { model: string; provider: string; lastSeen: number }[];
  override: { model: string; provider: string | null } | null;
  config: { model: string; provider: string } | null;
}

/**
 * A run's effective model, from the surest to the least sure: the last call observed, the usage the factory
 * recorded (the latest: a fallback adds a line), the card's override, the agent's config.
 */
export function effectiveModel(evidence: ModelEvidence): ModelRef | null {
  if (evidence.live) return { ...evidence.live, source: 'live' };
  const latest = [...evidence.session].sort((left, right) => right.lastSeen - left.lastSeen)[0];
  if (latest) return { model: latest.model, provider: latest.provider, source: 'session' };
  if (evidence.override) {
    return {
      model: evidence.override.model,
      provider: evidence.override.provider ?? evidence.config?.provider ?? '?',
      source: 'override',
    };
  }
  return evidence.config ? { ...evidence.config, source: 'config' } : null;
}
