import type { z } from 'zod';
import type { RegisterInput } from '@sathi/shared';
import type { loginSchema, verifyEmailSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema } from './auth.validation';

export type { RegisterInput };
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** The user fields that are safe to return to clients. */
export interface PublicUser {
  id: string;
  email: string;
  role: string;
  displayName: string;
  emailVerified: boolean;
  timezone?: string;
}
