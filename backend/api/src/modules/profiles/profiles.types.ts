import type { z } from 'zod';
import type { saveVerifiedFile } from '../../helpers/file.helper';
import type { youthProfileSchema, counselorProfileSchema } from './profiles.validation';

export type YouthProfileInput = z.infer<typeof youthProfileSchema>;
export type CounselorProfileInput = z.infer<typeof counselorProfileSchema>;
export type UploadedFile = Parameters<typeof saveVerifiedFile>[0];
