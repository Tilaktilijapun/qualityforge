import { describe, expect, it } from 'vitest';
import { pool } from '@backend/db';
import { createProduct, createUser } from '@testdata/factories';

// The database is the last line of defence: these prove constraints hold even if app code is bypassed.
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

describe('schema constraints', () => {
  it('rejects negative stock', async () => {
    const p = await createProduct({ stock: 1 });
    await expect(pool.query('UPDATE products SET stock = -1 WHERE id = $1', [p.id]))
      .rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('rejects negative prices', async () => {
    const p = await createProduct();
    await expect(pool.query('UPDATE products SET price_cents = -5 WHERE id = $1', [p.id]))
      .rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it.each([0, 11])('rejects cart quantity %s', async (qty) => {
    const u = await createUser();
    const p = await createProduct();
    await expect(pool.query('INSERT INTO cart_items VALUES ($1,$2,$3)', [u.id, p.id, qty]))
      .rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('treats emails as case-insensitively unique', async () => {
    await createUser({ email: 'Case@qualityforge.test' });
    await expect(pool.query(`INSERT INTO users (email, password_hash) VALUES ('CASE@qualityforge.test','x')`))
      .rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it('rejects an unknown role and an unknown order status', async () => {
    await expect(pool.query(`INSERT INTO users (email, password_hash, role) VALUES ('r@qualityforge.test','x','root')`))
      .rejects.toMatchObject({ code: CHECK_VIOLATION });
    const u = await createUser();
    await expect(pool.query(
      `INSERT INTO orders (user_id,status,subtotal_cents,discount_cents,total_cents,idempotency_key)
       VALUES ($1,'shipped',0,0,0,'key-bad-status')`, [u.id],
    )).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('enforces one order per (user, idempotency key) but allows the same key for another user', async () => {
    const [u1, u2] = [await createUser(), await createUser()];
    const insert = (uid: string) => pool.query(
      `INSERT INTO orders (user_id,status,subtotal_cents,discount_cents,total_cents,idempotency_key)
       VALUES ($1,'paid',0,0,0,'shared-key-0001')`, [uid]);

    await insert(u1.id);
    await expect(insert(u1.id)).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    await expect(insert(u2.id)).resolves.toBeDefined();
  });
});
