import { z } from 'zod';

export const manualLinkSchema = z.object({ url: z.string().url().startsWith('https://') });

/** Parsed with `safeParse` in the controller: the OAuth callback redirects to the frontend instead of returning a 400. */
export const googleCallbackQuery = z.object({ code: z.string().optional(), state: z.string(), error: z.string().optional() });
