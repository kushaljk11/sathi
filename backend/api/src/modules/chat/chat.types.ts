import type { z } from 'zod';
import type { listMessagesQuery, reportMessageSchema } from './chat.validation';

export type ListMessagesQuery = z.infer<typeof listMessagesQuery>;
export type ReportMessageInput = z.infer<typeof reportMessageSchema>;
