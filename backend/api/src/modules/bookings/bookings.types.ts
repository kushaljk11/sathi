import type { z } from 'zod';
import type { holdSlotSchema, createBookingSchema, listBookingsQuery, decisionSchema, cancelBookingSchema, rescheduleSchema, outcomeSchema } from './bookings.validation';

export type HoldSlotInput = z.infer<typeof holdSlotSchema>;
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type ListBookingsQuery = z.infer<typeof listBookingsQuery>;
export type DecisionInput = z.infer<typeof decisionSchema>;
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;
export type RescheduleInput = z.infer<typeof rescheduleSchema>;
export type OutcomeInput = z.infer<typeof outcomeSchema>;
