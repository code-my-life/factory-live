import { generateKeyPairSync } from 'node:crypto';

let appKey: string | null = null;

/** Clé privée de la GitHub App simulée (RSA 2048, au format PKCS#1 que rend GitHub), créée une seule fois. */
export function appPem(): string {
  appKey ??= generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs1', format: 'pem' })
    .toString();
  return appKey;
}
