export const CATEGORIES = ['general', 'stress', 'study', 'relationships', 'family', 'wellbeing-tips', 'recovery'] as const;

export const CONTENT_TYPES = ['POST', 'COMMENT'] as const;
export const REACTION_KINDS = ['SUPPORT', 'RELATE', 'THANKS'] as const;
export const REPORT_REASONS = ['spam', 'bullying', 'harassment', 'hate', 'threat', 'personal-info', 'self-harm-concern', 'other'] as const;

/** A single report with one of these reasons sends the content straight to review. */
export const ESCALATING_REPORT_REASONS: readonly string[] = ['threat', 'self-harm-concern'];

export const POST_BODY_MAX = 4000;
export const COMMENT_BODY_MAX = 2000;

/** Posting/commenting/editing: max writes per user per window. */
export const POST_RATE_WINDOW_MS = 60_000;
export const POST_RATE_LIMIT = 6;
