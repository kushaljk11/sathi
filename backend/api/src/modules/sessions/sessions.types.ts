import type { z } from 'zod';
import type { sessionRecordSchema } from './sessions.validation';

export type SessionRecordInput = z.infer<typeof sessionRecordSchema>;
