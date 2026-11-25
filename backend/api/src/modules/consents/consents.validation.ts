import { z } from 'zod';

export const consentCategory = z.enum(['ASSESSMENT_SUMMARY', 'SUPPORT_NEED_PROFILE', 'CHECKIN_TRENDS', 'SUPPORT_HISTORY']);
export const consentInput = z.array(z.object({ category: consentCategory, granted: z.boolean() })).max(4);

export const updateConsentsSchema = z.object({ counselorId: z.string().uuid(), items: consentInput });
