import { z } from 'zod';

const availabilityWindow = z
  .object({ day: z.number().int().min(0).max(6), startMin: z.number().int().min(0).max(1440), endMin: z.number().int().min(0).max(1440) })
  .refine((w) => w.endMin > w.startMin, 'End must be after start');

export const assessmentAnswers = z.object({
  concerns: z.array(z.string().max(60)).min(1).max(10),
  impact: z.number().int().min(1).max(5),
  duration: z.enum(['<2 weeks', '2-4 weeks', '1-3 months', '3-12 months', '>1 year']),
  desiredSupport: z.array(z.string().max(60)).min(1).max(6),
  languages: z.array(z.string().max(20)).min(1).max(5),
  locationArea: z.string().max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  maxTravelKm: z.number().int().min(0).max(500).optional(),
  mode: z.enum(['ONLINE', 'IN_PERSON', 'BOTH']),
  availability: z.array(availabilityWindow).min(1).max(21),
  accessibility: z.array(z.string().max(60)).max(10).default([]),
});

export const saveDraftSchema = z.object({ draft: z.record(z.unknown()) });
