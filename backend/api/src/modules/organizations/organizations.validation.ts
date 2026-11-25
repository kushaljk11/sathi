import { z } from 'zod';

const mode = z.enum(['ONLINE', 'IN_PERSON', 'BOTH']);
const strArr = z.array(z.string().min(1).max(60)).max(20);

export const idParamSchema = z.object({ id: z.string().uuid() });

// ---------- organization profile & staff ----------
export const organizationProfileSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(3000).nullable().optional(),
  contactEmail: z.string().email(),
  contactPhone: z.string().max(30).nullable().optional(),
  locationArea: z.string().max(100).nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  languages: strArr,
  operatingHours: z.string().max(200).nullable().optional(),
});

export const addStaffSchema = z.object({ email: z.string().email() });

// ---------- programs & services ----------
export const programSchema = z
  .object({
    title: z.string().min(3).max(200),
    description: z.string().min(10).max(5000),
    category: z.string().min(2).max(60),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    seats: z.number().int().min(1).max(10000),
    minAge: z.number().int().min(10).max(40).nullable().optional(),
    maxAge: z.number().int().min(10).max(40).nullable().optional(),
    eligibility: z.string().max(1000).nullable().optional(),
    locationArea: z.string().max(100).nullable().optional(),
    mode,
    costPaisa: z.number().int().min(0).max(100_000_00),
    requirements: z.string().max(1000).nullable().optional(),
  })
  .refine((p) => p.endsAt > p.startsAt, 'End must be after start');

export const serviceSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  category: z.string().min(2).max(60),
  durationMin: z.number().int().min(15).max(600),
  capacity: z.number().int().min(1).max(10000),
  locationArea: z.string().max(100).nullable().optional(),
  mode,
  costPaisa: z.number().int().min(0),
});

export const attendanceSchema = z.object({ date: z.coerce.date(), present: z.boolean() });

export const bookingStatusSchema = z.object({ status: z.enum(['COMPLETED', 'NO_SHOW', 'CANCELLED']) });
