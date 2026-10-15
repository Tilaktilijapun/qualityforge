import { describe, expect, it } from 'vitest';
import { pool } from '@backend/db';
import { checkout } from '@backend/services/orders.service';
import { addToCart, countRows, createProduct, createUser, stockOf } from '@testdata/factories';

describe('checkout — happy path and totals', () => {
  it('creates a paid order, deducts stock and clears the cart in one go (REQ-CHK-3)', async () => {
    const user = await createUser();
    const a = await createProduct({ priceCents: 2000, stock: 10 });
    const b = await createProduct({ priceCents: 500, stock: 4 });
    await addToCart(user.id, a.id, 3);
    await addToCart(user.id, b.id, 4);

    const { order, replayed } = await checkout(user.id, 'key-happy-0001', 'success');

    expect(replayed).toBe(false);
    expect(order.status).toBe('paid');
    expect(order.items).toHaveLength(2);
    expect(await stockOf(a.id)).toBe(7);
    expect(await stockOf(b.id)).toBe(0);
    expect(await countRows('cart_items')).toBe(0);
  });

  it('applies the 10% discount at the threshold and stores the snapshot (REQ-CART-2/3)', async () => {
    const user = await createUser();
    const p = await createProduct({ priceCents: 6000, stock: 5 });
    await addToCart(user.id, p.id, 2);

    const { order } = await checkout(user.id, 'key-discount-01', 'success');
    expect(order).toMatchObject({ subtotalCents: 12000, discountCents: 1200, totalCents: 10800 });

    await pool.query('UPDATE products SET price_cents = 1 WHERE id = $1', [p.id]);
    const stored = await pool.query('SELECT unit_price_cents FROM order_items WHERE order_id = $1', [order.id]);
    expect(stored.rows[0].unit_price_cents).toBe(6000); // later price changes don't rewrite history
  });

  it('rejects an empty cart with CART_EMPTY', async () => {
    const user = await createUser();
    await expect(checkout(user.id, 'key-empty-0001', 'success')).rejects.toMatchObject({ code: 'CART_EMPTY' });
    expect(await countRows('orders')).toBe(0);
  });

  it('rejects carts containing an inactive product', async () => {
    const user = await createUser();
    const p = await createProduct({ active: false });
    await addToCart(user.id, p.id, 1);
    await expect(checkout(user.id, 'key-inactive-01', 'success')).rejects.toMatchObject({ code: 'PRODUCT_UNAVAILABLE' });
  });
});

describe('checkout — failure paths leave no partial state', () => {
  it('rolls back everything when a later line is short on stock (REQ-CHK-3)', async () => {
    const user = await createUser();
    // Fixed ids so product A is always processed (and decremented) before B fails.
    const a = await createProduct({ id: '00000000-0000-4000-8000-000000000001', stock: 5 });
    const b = await createProduct({ id: '00000000-0000-4000-8000-000000000002', stock: 1 });
    await addToCart(user.id, a.id, 1);
    await addToCart(user.id, b.id, 2);

    await expect(checkout(user.id, 'key-rollback-01', 'success')).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      details: { productId: b.id },
    });

    expect(await stockOf(a.id)).toBe(5); // A's deduction was rolled back
    expect(await stockOf(b.id)).toBe(1);
    expect(await countRows('orders')).toBe(0);
    expect(await countRows('order_items')).toBe(0);
    expect(await countRows('cart_items')).toBe(2); // cart kept so the user can adjust it
  });

  it('records a payment_failed order for a declined payment without touching stock or cart (REQ-CHK-4)', async () => {
    const user = await createUser();
    const p = await createProduct({ stock: 5 });
    await addToCart(user.id, p.id, 2);

    const { order } = await checkout(user.id, 'key-declined-01', 'declined');

    expect(order.status).toBe('payment_failed');
    expect(await stockOf(p.id)).toBe(5);
    expect(await countRows('cart_items')).toBe(1);
  });
});

describe('checkout — idempotency and concurrency (REQ-CHK-2)', () => {
  it('replays the original order for a repeated key and deducts stock once', async () => {
    const user = await createUser();
    const p = await createProduct({ stock: 10 });
    await addToCart(user.id, p.id, 2);

    const first = await checkout(user.id, 'key-replay-0001', 'success');
    const second = await checkout(user.id, 'key-replay-0001', 'success');

    expect(second.replayed).toBe(true);
    expect(second.order.id).toBe(first.order.id);
    expect(await countRows('orders')).toBe(1);
    expect(await stockOf(p.id)).toBe(8);
  });

  it('creates exactly one order when the same key is submitted 5× concurrently', async () => {
    const user = await createUser();
    const p = await createProduct({ stock: 10 });
    await addToCart(user.id, p.id, 2);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => checkout(user.id, 'key-concurrent-1', 'success')),
    );

    expect(new Set(results.map((r) => r.order.id)).size).toBe(1);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(await countRows('orders')).toBe(1);
    expect(await stockOf(p.id)).toBe(8);
  });

  it('lets only one of two users buy the last unit; stock never goes negative (REQ-CHK-3)', async () => {
    const [u1, u2] = [await createUser(), await createUser()];
    const p = await createProduct({ stock: 1 });
    await addToCart(u1.id, p.id, 1);
    await addToCart(u2.id, p.id, 1);

    const results = await Promise.allSettled([
      checkout(u1.id, 'key-last-unit-1', 'success'),
      checkout(u2.id, 'key-last-unit-2', 'success'),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(await stockOf(p.id)).toBe(0);
    expect(await countRows('orders')).toBe(1);
  });

  it('does not double-spend one cart with two different keys at once', async () => {
    const user = await createUser();
    const p = await createProduct({ stock: 10 });
    await addToCart(user.id, p.id, 3);

    const results = await Promise.allSettled([
      checkout(user.id, 'key-double-spend-1', 'success'),
      checkout(user.id, 'key-double-spend-2', 'success'),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'CART_EMPTY' });
    expect(await countRows('orders')).toBe(1);
    expect(await stockOf(p.id)).toBe(7);
  });
});
