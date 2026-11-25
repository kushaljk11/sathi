import type { z } from 'zod';
import type { replaceAvailabilitySchema, exceptionSchema, generateSlotsSchema } from './availability.validation';

export type ReplaceAvailabilityInput = z.infer<typeof replaceAvailabilitySchema>;
export type ExceptionInput = z.infer<typeof exceptionSchema>;
export type GenerateSlotsInput = z.infer<typeof generateSlotsSchema>;

export interface WeeklyRule {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  slotMinutes: number;
}

export interface TimeRange {
  startsAt: Date;
  endsAt: Date;
}
