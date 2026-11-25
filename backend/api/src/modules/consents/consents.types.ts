import type { z } from 'zod';
import type { consentInput, updateConsentsSchema } from './consents.validation';

export type ConsentItemsInput = z.infer<typeof consentInput>;
export type UpdateConsentsInput = z.infer<typeof updateConsentsSchema>;
