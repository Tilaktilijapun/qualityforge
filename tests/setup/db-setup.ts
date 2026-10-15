import { afterAll, beforeEach } from 'vitest';
import { pool } from '@backend/db';
import { assertTestDatabaseUrl } from './env';

// Every test starts from an empty database; tests create what they need via factories.
beforeEach(async () => {
  assertTestDatabaseUrl(process.env.DATABASE_URL);
  await pool.query('TRUNCATE order_items, orders, cart_items, products, users RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await pool.end();
});
