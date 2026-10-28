import { pino } from 'pino';
import type { Logger } from 'pino';

export type { Logger };

/** Journal JSON sur stdout (Docker le fait tourner) ; chaque composant a son enfant `component`. */
export function createLogger(level: string): Logger {
  return pino({
    level,
    base: { service: 'factory-live' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', '*.token', '*.secret'],
      censor: '[secret masqué]',
    },
  });
}
