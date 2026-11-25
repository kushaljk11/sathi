import type { z } from 'zod';
import type { initiatePaymentSchema } from './payments.validation';

export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;
export type PaymentProvider = InitiatePaymentInput['provider'];

/** What is being paid for: exactly one of the two ids. */
export interface PaymentTarget {
  appointmentId?: string;
  programBookingId?: string;
}
