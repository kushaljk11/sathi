/** Static, non-secret application values. Secrets and environment-specific values belong in config/env.ts. */
export const API_PREFIX = '/api/v1';

// ---- auth ----
export const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_TOKEN_DAYS = 7;
export const REFRESH_COOKIE = 'sathi_rt';
export const REFRESH_COOKIE_PATH = `${API_PREFIX}/auth`;

// ---- request limits ----
export const JSON_BODY_LIMIT = '100kb';
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// ---- platform settings (admin-editable, with safe defaults) ----
export const SETTING_DEFAULTS = {
  'moderation.thresholds': { hold: 0.5, hide: 0.85, reject: 0.9 },
  'moderation.extraTerms': [] as string[],
  'moderation.retentionDays': 365,
  'moderation.reportsToFlag': 3,
  'refund.policy': { fullHours: 24, partialHours: 2, partialPercent: 50 },
  'followup.hoursAfterSession': 48,
  'safety.rules': { escalateOnAnyYes: ['harm_self_now', 'harm_others_now', 'unsafe_now'], ruleVersion: 1 },
  'platform.supportEmail': 'support@sathi.local',
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
