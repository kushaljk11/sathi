import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://sathi@localhost:5434/sathi_it',
      JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough-123',
      JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-long-enough-123',
      FRONTEND_URL: 'http://localhost:5173',
      BACKEND_URL: 'http://localhost:4000',
      ESEWA_SECRET_KEY: 'test-esewa-signing-key',
      ESEWA_MERCHANT_CODE: 'EPAYTEST',
      KHALTI_SECRET_KEY: 'test-khalti-key',
      GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', GOOGLE_REDIRECT_URI: 'http://localhost:4000/api/v1/meetings/google/callback',
      ALLOW_DEV_MANUAL_MEETINGS: 'false',
      UPLOAD_DIR: 'test-uploads',
    },
  },
});
