export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://qf:qf@localhost:5432/qualityforge_test';

/** Safety net: the suite TRUNCATES tables, so it must never touch a non-test database. */
export function assertTestDatabaseUrl(url: string | undefined): void {
  const name = url ? new URL(url).pathname.replace(/^\//, '') : '';
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to run: database "${name}" does not end with "_test"`);
  }
}
