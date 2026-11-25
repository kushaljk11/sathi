import type { z } from 'zod';
import type { updateMeSchema, notificationPreferencesSchema, deleteAccountSchema } from './users.validation';

export type UpdateMeInput = z.infer<typeof updateMeSchema>;
export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
