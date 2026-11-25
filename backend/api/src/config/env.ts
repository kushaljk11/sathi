import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).optional(),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  FRONTEND_URL: z.string().url(),
  BACKEND_URL: z.string().url(),
  EMAIL_HOST: z.string().optional(),
  EMAIL_PORT: z.coerce.number().optional(),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().default('Sathi <no-reply@sathi.local>'),
  FCM_PROJECT_ID: z.string().optional(),
  FCM_CLIENT_EMAIL: z.string().optional(),
  FCM_PRIVATE_KEY: z.string().optional(),
  ESEWA_MERCHANT_CODE: z.string().default('EPAYTEST'),
  ESEWA_SECRET_KEY: z.string().optional(),
  ESEWA_BASE_URL: z.string().default('https://rc-epay.esewa.com.np'),
  KHALTI_SECRET_KEY: z.string().optional(),
  KHALTI_BASE_URL: z.string().default('https://dev.khalti.com/api/v2'),
  ENCRYPTION_KEY: z.string().optional(), // base64, 32 bytes. Required in production.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  ALLOW_DEV_MANUAL_MEETINGS: z.enum(['true', 'false']).default('true'),
  MODERATION_PROVIDER: z.enum(['local', 'perspective']).default('local'),
  PERSPECTIVE_API_KEY: z.string().optional(),
  UPLOAD_DIR: z.string().default('uploads'),
  TRUST_PROXY: z.coerce.number().default(0),
  DISABLE_DEV_MAINTENANCE: z.enum(['true', 'false']).default('false'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

if (isProd && (!env.ENCRYPTION_KEY || !env.BACKEND_URL.startsWith('https://'))) {
  console.error('Production requires ENCRYPTION_KEY and an https BACKEND_URL');
  process.exit(1);
}

export const googleConfigured = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI);
export const khaltiConfigured = !!env.KHALTI_SECRET_KEY;
export const esewaConfigured = !!env.ESEWA_SECRET_KEY;
export const fcmConfigured = !!(env.FCM_PROJECT_ID && env.FCM_CLIENT_EMAIL && env.FCM_PRIVATE_KEY);
export const devManualMeetings = !isProd && env.ALLOW_DEV_MANUAL_MEETINGS === 'true';
