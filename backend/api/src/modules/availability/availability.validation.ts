import { z } from 'zod';

const availabilityRule = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
    slotMinutes: z.number().int().min(15).max(180),
  })
  .refine((a) => a.endMinute > a.startMinute, 'End must be after start');

export const replaceAvailabilitySchema = z.object({ weekly: z.array(availabilityRule).max(50) });

export const exceptionSchema = z
  .object({ startsAt: z.coerce.date(), endsAt: z.coerce.date(), reason: z.string().max(200).optional() })
  .refine((x) => x.endsAt > x.startsAt);

export const generateSlotsSchema = z.object({ days: z.number().int().min(1).max(60).default(14) });
