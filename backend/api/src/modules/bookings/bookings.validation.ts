import { z } from 'zod';
import { consentInput } from '../consents/consents.validation';

export const holdSlotSchema = z.object({ slotId: z.string().uuid() });

export const createBookingSchema = z.object({ holdId: z.string().uuid(), mode: z.enum(['ONLINE', 'IN_PERSON']), consents: consentInput });

export const listBookingsQuery = z.object({ scope: z.enum(['upcoming', 'past', 'all']).default('all'), status: z.string().optional() });

export const decisionSchema = z.object({ decision: z.enum(['ACCEPT', 'DECLINE']), reason: z.string().max(300).optional() });

export const cancelBookingSchema = z.object({ reason: z.string().max(300).optional() });

export const rescheduleSchema = z.object({ holdId: z.string().uuid() });

export const outcomeSchema = z.object({ outcome: z.enum(['COMPLETED', 'MISSED']) });
