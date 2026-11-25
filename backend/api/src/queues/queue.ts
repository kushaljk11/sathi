import { Queue, type JobsOptions } from 'bullmq';
import { env, isProd, isTest } from '../config/env';
import { logger } from '../core/logger/logger';

export const QUEUE = 'notifications';
const DEFAULTS: JobsOptions = { attempts: 5, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000, removeOnFail: false };

let queue: Queue | null = null;
let redisDown = false;

export const redisConnection = () => {
  const u = new URL(env.REDIS_URL);
  return { host: u.hostname, port: Number(u.port || 6379), password: u.password || undefined, maxRetriesPerRequest: null, enableOfflineQueue: false, connectTimeout: 2000 };
};

export function getQueue() {
  if (!queue) {
    queue = new Queue(QUEUE, { connection: redisConnection() });
    queue.on('error', () => {
      redisDown = true;
    });
  }
  return queue;
}

const devAdapter = (name: string, data: Record<string, unknown>, jobId?: string) => {
  logger.warn(`[DEV QUEUE ADAPTER] Redis unavailable; job "${name}" not scheduled`, name === 'email' ? { to: data.to, subject: data.subject, text: data.text } : { jobId });
  return { queued: false, dev: true };
};

/**
 * Enqueue a background job. `jobId` gives idempotency (BullMQ ignores duplicate ids).
 * In dev without Redis, logs via a clearly-labelled DEV adapter instead of failing the request;
 * in production a queue failure is surfaced to the caller.
 */
export async function enqueue(name: string, data: Record<string, unknown>, opts: JobsOptions = {}) {
  if (isTest) return { queued: false, dev: true };
  if (redisDown && !isProd) return devAdapter(name, data, opts.jobId);
  try {
    await getQueue().add(name, data, { ...DEFAULTS, ...opts });
    return { queued: true };
  } catch (e) {
    if (isProd) throw e;
    redisDown = true;
    return devAdapter(name, data);
  }
}

/** Cancel previously scheduled jobs (e.g. reminders after cancellation). Best effort. */
export async function removeJobs(ids: string[]) {
  if (isTest || redisDown) return;
  try {
    await Promise.all(ids.map((id) => getQueue().remove(id)));
  } catch {
    /* best effort */
  }
}
