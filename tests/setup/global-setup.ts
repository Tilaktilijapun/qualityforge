import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertTestDatabaseUrl, TEST_DATABASE_URL } from './env';

/** Runs once before the db project: apply migrations to the test database (idempotent). */
export default function setup() {
  assertTestDatabaseUrl(TEST_DATABASE_URL);
  try {
    execSync('npm run migrate --workspace app/backend', {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: 'pipe',
    });
  } catch (err: any) {
    throw new Error(
      `Could not migrate the test database. Is Postgres running (docker compose up -d db)?\n${err.stderr?.toString() ?? err.message}`,
    );
  }
}
