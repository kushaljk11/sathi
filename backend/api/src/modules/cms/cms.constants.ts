export const ARTICLE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export const CONTACT_STATUSES = ['NEW', 'IN_PROGRESS', 'RESOLVED', 'SPAM'] as const;

export const SLUG_MAX_LENGTH = 80;
export const WORDS_PER_MINUTE = 200;
export const RELATED_ARTICLE_COUNT = 3;

/** Cover image keys are server-generated UUID filenames; anything else is rejected before touching storage. */
export const COVER_KEY_PATTERN = /^[0-9a-f-]{36}\.(png|jpg)$/;

export const SITEMAP_STATIC_PAGES = ['/', '/about', '/features', '/blog', '/contact', '/login', '/register'];

export const CONTACT_RATE_WINDOW_MS = 60 * 60_000;
export const CONTACT_RATE_LIMIT = 5;
/** Submissions faster than this after the form rendered are treated as bots. */
export const CONTACT_MIN_FILL_MS = 3000;
export const CONTACT_SPAM_SCORE = 0.9;
