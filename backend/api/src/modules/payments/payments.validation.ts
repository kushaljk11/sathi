import { z } from 'zod';

export const initiatePaymentSchema = z
  .object({ provider: z.enum(['ESEWA', 'KHALTI']), appointmentId: z.string().uuid().optional(), programBookingId: z.string().uuid().optional() })
  .refine((x) => !!x.appointmentId !== !!x.programBookingId, 'Provide exactly one target');
