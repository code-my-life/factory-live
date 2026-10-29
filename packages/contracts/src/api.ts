import { z } from 'zod';
import { Timestamp } from './common.ts';

/** Abonnement Web Push d'un appareil (forme de `PushSubscription.toJSON()`). */
export const PushSubscriptionInput = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  device: z.string().max(100).optional(),
});
export type PushSubscriptionInput = z.infer<typeof PushSubscriptionInput>;

export const PushKey = z.object({ publicKey: z.string() });
export type PushKey = z.infer<typeof PushKey>;

/** Erreur remontée par la PWA, utile sur iPhone où la console n'est pas sous la main. */
export const ClientLog = z.object({
  level: z.enum(['error', 'warn', 'info']),
  message: z.string().max(2000),
  stack: z.string().max(8000).nullable(),
  url: z.string().max(500),
  userAgent: z.string().max(500),
  at: Timestamp,
});
export type ClientLog = z.infer<typeof ClientLog>;

/**
 * Raison d'un refus que la PWA peut montrer : elle l'écrit dans sa langue. Le texte de `error`
 * reste en français, pour les journaux et pour qui appelle l'API à la main.
 */
export const ApiErrorCode = z.enum([
  'invalid_request',
  'not_found',
  'internal',
  'intervention_unknown',
  'unblock_not_available',
  'github_login_required',
  'github_refused',
  'push_unavailable',
  'write_login_refused',
  'write_local_only',
  'origin_refused',
  'csrf_missing',
  'rate_limited',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

/** Réponse d'erreur commune de l'API. */
export const ApiError = z.object({
  error: z.string(),
  code: ApiErrorCode.optional(),
  detail: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiError>;

/** Accès de factory-live à GitHub : GitHub App (lectures) et connexion de Clément (déblocage). */
export const GitHubAccess = z.object({
  mode: z.enum(['app', 'token', 'none']),
  app: z
    .object({
      slug: z.string(),
      url: z.string(),
      installed: z.boolean().nullable(),
      installUrl: z.url(),
    })
    .nullable(),
  user: z
    .object({ login: z.string(), avatarUrl: z.string().nullable(), expiresAt: Timestamp })
    .nullable(),
  setupUrl: z.string(),
  loginUrl: z.string(),
});
export type GitHubAccess = z.infer<typeof GitHubAccess>;
