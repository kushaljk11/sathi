import type { z } from 'zod';
import type { manualLinkSchema, googleCallbackQuery } from './meetings.validation';

export type ManualLinkInput = z.infer<typeof manualLinkSchema>;
export type GoogleCallbackQuery = z.infer<typeof googleCallbackQuery>;

/** Outcome of the Google OAuth callback; sent to the frontend as `?google=<result>`. */
export type GoogleCallbackResult = 'connected' | 'expired' | 'denied' | 'no_refresh_token' | 'scope_missing' | 'error';
