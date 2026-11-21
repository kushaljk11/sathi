import { Queue, type JobsOptions } from 'bullmq';
import { env } from './env';

export const QUEUE = 'notifications';
let queue: Queue | null = null;
let redisDown = false;

export const redisConnection = () => {
  const u = new URL(env.REDIS_URL);
  return { host: u.hostname, port: Number(u.port || 6379), password: u.password || undefined, maxRetriesPerRequest: null, enableOfflineQueue: false, connectTimeout: 2000 };
};

export function getQueue() {
  if (!queue) {
    queue = new Queue(QUEUE, { connection: redisConnection() });
    queue.on('error', () => { redisDown = true; });
  }
  return queue;
}

const DEFAULTS: JobsOptions = { attempts: 5, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000, removeOnFail: false };

/**
 * Enqueue a background job. jobId gives idempotency (BullMQ ignores duplicate ids).
 * In dev/test without Redis, logs via a clearly-labelled DEV adapter instead of failing the request.
 */
export async function enqueue(name: string, data: Record<string, unknown>, opts: JobsOptions = {}) {
  if (env.NODE_ENV === 'test') return { queued: false, dev: true };
  if (redisDown && env.NODE_ENV !== 'production') {
    console.warn(`[DEV QUEUE ADAPTER] Redis unavailable; job "${name}" not scheduled`, name === 'email' ? { to: data.to, subject: data.subject, text: data.text } : { jobId: opts.jobId });
    return { queued: false, dev: true };
  }
  try {
    await getQueue().add(name, data, { ...DEFAULTS, ...opts });
    return { queued: true };
  } catch (e) {
    if (env.NODE_ENV === 'production') throw e;
    redisDown = true;
    console.warn(`[DEV QUEUE ADAPTER] Redis unavailable; job "${name}" not scheduled`, name === 'email' ? { to: data.to, subject: data.subject, text: data.text } : {});
    return { queued: false, dev: true };
  }
}

export const enqueueEmail = (to: string, subject: string, text: string, jobId?: string) => enqueue('email', { to, subject, text }, jobId ? { jobId } : {});

/** Cancel previously scheduled jobs (e.g. reminders after cancellation). */
export async function removeJobs(ids: string[]) {
  if (env.NODE_ENV === 'test' || redisDown) return;
  try { await Promise.all(ids.map((id) => getQueue().remove(id))); } catch { /* best effort */ }
}
