import { z } from 'zod';

const minuteOfDay = z.number().int().min(0).max(1439).nullable();

export const updateMeSchema = z.object({
  displayName: z.string().min(2).max(80).optional(),
  timezone: z.string().max(60).optional(),
});

export const notificationPreferencesSchema = z.object({
  email: z.boolean(),
  push: z.boolean(),
  quietStartMin: minuteOfDay,
  quietEndMin: minuteOfDay,
  fcmToken: z.string().max(4096).nullable().optional(),
});

export const deleteAccountSchema = z.object({ password: z.string() });
