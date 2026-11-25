/**
 * Minimal leveled logger. Human-readable in development, one JSON object per line in production
 * (easy to ship to any log aggregator). Never log secrets, tokens or wellbeing data.
 * Reads process.env directly so it can be used by config/env.ts-independent code (and by env itself).
 */
type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level | 'silent', number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

const nodeEnv = process.env.NODE_ENV ?? 'development';
const threshold = ORDER[(process.env.LOG_LEVEL as Level | 'silent' | undefined) ?? (nodeEnv === 'test' ? 'silent' : nodeEnv === 'production' ? 'info' : 'debug')] ?? ORDER.info;
const json = nodeEnv === 'production';

function write(level: Level, message: string, meta?: Record<string, unknown>) {
  if (ORDER[level] < threshold) return;
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (json) return sink(JSON.stringify({ time: new Date().toISOString(), level, message, ...meta }));
  sink(`[${level.toUpperCase()}] ${message}`, ...(meta ? [meta] : []));
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => write('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
};
