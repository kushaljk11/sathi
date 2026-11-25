import type { z } from 'zod';
import type { saveVerifiedFile } from '../../helpers/file.helper';
import type { idParamSchema, organizationProfileSchema, addStaffSchema, programSchema, serviceSchema, attendanceSchema, bookingStatusSchema } from './organizations.validation';

export type IdParams = z.infer<typeof idParamSchema>;
export type OrganizationProfileInput = z.infer<typeof organizationProfileSchema>;
export type AddStaffInput = z.infer<typeof addStaffSchema>;
export type ProgramInput = z.infer<typeof programSchema>;
export type ServiceInput = z.infer<typeof serviceSchema>;
export type AttendanceInput = z.infer<typeof attendanceSchema>;
export type BookingStatusInput = z.infer<typeof bookingStatusSchema>;
export type UploadedFile = Parameters<typeof saveVerifiedFile>[0];
