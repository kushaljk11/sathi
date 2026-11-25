import { z } from 'zod';

const mode = z.enum(['ONLINE', 'IN_PERSON', 'BOTH']);
const strArr = z.array(z.string().min(1).max(60)).max(20);

export const youthProfileSchema = z.object({
  ageGroup: z.enum(['13-14', '15-17', '18-24', '25-29']).nullable().optional(),
  locationArea: z.string().max(100).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  maxTravelKm: z.number().int().min(0).max(500).nullable().optional(),
  preferredLanguages: strArr.optional(),
  preferredMode: mode.optional(),
  accessibility: strArr.optional(),
  checkInFrequencyDays: z.number().int().min(1).max(30).optional(),
});

export const counselorProfileSchema = z.object({
  qualifications: z.string().min(2).max(500),
  experienceYears: z.number().int().min(0).max(60),
  bio: z.string().max(2000).nullable().optional(),
  specializations: strArr,
  supportedConcerns: strArr,
  languages: strArr,
  ageGroups: strArr,
  locationArea: z.string().max(100).nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  mode,
  sessionFeePaisa: z.number().int().min(0).max(10_000_000),
  acceptingBookings: z.boolean(),
});
