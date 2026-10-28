import { z } from 'zod';
import { HealthStatus } from './health.ts';

/**
 * Corps d'un webhook sortant natif d'Hermès (`hooks.outbound`), tel que l'envoie
 * `agent/outbound_webhooks.py` (v0.22.2) : champs communs de `agent/shell_hooks.py:_payload_fields`,
 * plus l'identifiant de livraison et l'horodatage, tous deux couverts par la signature HMAC.
 */
export const HermesHookBody = z.object({
  hook_event_name: z.string().min(1).max(100),
  profile: z.string().max(100),
  tool_name: z.string().max(200).nullable(),
  tool_input: z.record(z.string(), z.unknown()).nullable(),
  session_id: z.string().max(200),
  cwd: z.string().max(4096),
  extra: z.record(z.string(), z.unknown()),
  delivery_id: z.string().min(8).max(100),
  timestamp: z.iso.datetime({ offset: true }),
});
export type HermesHookBody = z.infer<typeof HermesHookBody>;

/** Une vérification de la sonde `factory-live-probe` (plugin du gateway). */
export const ProbeCheck = z.object({
  id: z.string().min(1).max(100),
  label: z.string().max(200),
  status: HealthStatus,
  detail: z.string().max(2000),
  metrics: z.record(z.string(), z.string()),
});
export type ProbeCheck = z.infer<typeof ProbeCheck>;

/** Rapport de santé poussé toutes les 30 s par la sonde, signé `X-Factory-Live-Signature-256`. */
export const ProbeReport = z.object({
  v: z.literal(1),
  probe: z.literal('factory-live-probe'),
  at: z.iso.datetime({ offset: true }),
  gatewayPid: z.number().int(),
  checks: z.array(ProbeCheck).max(50),
});
export type ProbeReport = z.infer<typeof ProbeReport>;
