import { z } from 'zod';

/** Register/login schemas are shared with the web app so both sides validate identically. */
export { registerSchema, loginSchema } from '@sathi/shared';

export const verifyEmailSchema = z.object({ token: z.string().min(10) });
export const forgotPasswordSchema = z.object({ email: z.string().email() });
export const resetPasswordSchema = z.object({ token: z.string().min(10), password: z.string().min(10).max(128) });
export const changePasswordSchema = z.object({ currentPassword: z.string(), newPassword: z.string().min(10).max(128) });
