import path from 'node:path';
import { defineWorkspace } from 'vitest/config';
import { TEST_DATABASE_URL } from './tests/setup/env';

const alias = {
  '@backend': path.resolve(__dirname, 'app/backend/src'),
  '@testdata': path.resolve(__dirname, 'test-data'),
};

export default defineWorkspace([
  {
    // Pure logic: no database, runs in parallel, should finish in seconds.
    resolve: { alias },
    test: {
      name: 'unit',
      include: ['tests/unit/**/*.test.ts'],
      environment: 'node',
      env: { NODE_ENV: 'test', JWT_SECRET: 'test-secret' },
    },
  },
  {
    // Integration + API tests share ONE database, so files must run one at a time.
    // The DB is truncated before every test (see tests/setup/db-setup.ts).
    resolve: { alias },
    test: {
      name: 'db',
      include: ['tests/integration/**/*.test.ts', 'tests/api/**/*.test.ts'],
      environment: 'node',
      globalSetup: ['./tests/setup/global-setup.ts'],
      setupFiles: ['./tests/setup/db-setup.ts'],
      fileParallelism: false,
      testTimeout: 20_000,
      env: { NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL, JWT_SECRET: 'test-secret' },
    },
  },
]);
