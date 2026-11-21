/**
 * Sathi background worker. Reuses the API's job processors so business rules live in one place.
 * Retries with exponential backoff; jobs that exhaust attempts are copied to the dead-letter queue.
 */
import { Queue, Worker, DelayedError, type Job } from 'bullmq';
import { processJob, DelayError } from '../../api/src/jobs/processor';
import { redisConnection, QUEUE } from '../../api/src/lib/queue';

const connection = redisConnection();
const dlq = new Queue(`${QUEUE}-dlq`, { connection });
const main = new Queue(QUEUE, { connection });

async function start() {
  // Repeatable maintenance jobs (idempotent scheduler ids).
  await main.upsertJobScheduler('sweep-every-minute', { every: 60_000 }, { name: 'sweep', data: {} });
  await main.upsertJobScheduler('daily-reminders', { pattern: '0 3 * * *', tz: 'UTC' }, { name: 'daily', data: {} });

  const worker = new Worker(
    QUEUE,
    async (job: Job, token?: string) => {
      try {
        await processJob(job.name, job.data);
      } catch (e) {
        if (e instanceof DelayError) {
          await job.moveToDelayed(Date.now() + e.ms, token); // respect quiet hours
          throw new DelayedError();
        }
        throw e;
      }
    },
    { connection, concurrency: 5 },
  );

  worker.on('failed', async (job, err) => {
    if (!job) return;
    console.error(`[worker] ${job.name}#${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts ?? 1}): ${err.message}`);
    if (job.attemptsMade >= (job.opts.attempts ?? 1))
      await dlq.add(job.name, { original: job.data, failedReason: err.message, failedAt: new Date().toISOString() }, { jobId: `dlq:${job.id}` });
  });
  worker.on('error', (e) => console.error('[worker] error', e.message));
  console.log(`Sathi worker processing "${QUEUE}" (DLQ: "${QUEUE}-dlq")`);

  const stop = async () => { await worker.close(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

start().catch((e) => { console.error('Worker failed to start:', e.message); process.exit(1); });
