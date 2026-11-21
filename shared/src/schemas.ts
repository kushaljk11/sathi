import { z } from 'zod';

export const RoleEnum = z.enum(['YOUTH', 'COUNSELOR', 'ORGANIZATION', 'ADMIN']);
export type Role = z.infer<typeof RoleEnum>;

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10, 'Use at least 10 characters').max(128),
  displayName: z.string().min(2).max(80),
  role: z.enum(['YOUTH', 'COUNSELOR', 'ORGANIZATION']), // ADMIN is never self-registered
});
export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export const checkInSchema = z.object({
  mood: z.number().int().min(1).max(5),
  stress: z.number().int().min(0).max(10),
  sleep: z.number().int().min(1).max(5),
  energy: z.number().int().min(1).max(5),
  social: z.number().int().min(1).max(5),
  functioning: z.number().int().min(1).max(5),
  concerns: z.array(z.string()).max(10).default([]),
  reflection: z.string().max(2000).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type CheckInInput = z.infer<typeof checkInSchema>;
