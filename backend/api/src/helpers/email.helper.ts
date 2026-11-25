import { enqueue } from '../queues/queue';

/** Queues a plain-text email (delivered by the worker through integrations/email). */
export const enqueueEmail = (to: string, subject: string, text: string, jobId?: string) => enqueue('email', { to, subject, text }, jobId ? { jobId } : {});
