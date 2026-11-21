import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/** Applies migrations to the dedicated test database before the suite. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://sathi@localhost:5434/sathi_it';
  execSync('npx prisma migrate deploy', { cwd: resolve(__dirname, '../../..'), env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
}
