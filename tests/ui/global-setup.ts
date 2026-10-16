import { execSync } from 'node:child_process';

/** Migrate and seed the TEST database (idempotent). Never points at the dev database. */
export default function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://qf:qf@localhost:5432/qualityforge_test';
  if (!new URL(url).pathname.endsWith('_test')) throw new Error('UI tests must use a database ending in _test');
  const env = { ...process.env, DATABASE_URL: url };
  execSync('npm run migrate --workspace app/backend', { env, stdio: 'pipe' });
  execSync('npm run seed --workspace app/backend', { env, stdio: 'pipe' });
}
