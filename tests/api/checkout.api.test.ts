import { describe, expect, it } from 'vitest';
import { pool } from '@backend/db';
import { addToCart, countRows, createProduct, createUser, stockOf } from '@testdata/factories';
import { api, bearer } from '../helpers/app';

const checkout = (token: string, key?: string, body: object = {}) => {
  const req = api().post('/api/orders/checkout').set(bearer(token));
  return (key ? req.set('Idempotency-Key', key) : req).send(body);
};

async function cartWith(stock = 5, qty = 2, priceCents = 2500) {
  const user = await createUser();
  const product = await createProduct({ stock, priceCents });
  await addToCart(user.id, product.id, qty);
  return { user, product };
}

describe('POST /api/orders/checkout — request validation (REQ-CHK-1)', () => {
  it.each([
    ['is missing', undefined],
    ['is too short', 'short'],
    ['is too long', 'k'.repeat(101)],
  ])('rejects an Idempotency-Key that %s', async (_label, key) => {
    const { user } = await cartWith();
    const res = await checkout(user.token, key);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('rejects an unknown paymentOutcome', async () => {
    const { user } = await cartWith();
    expect((await checkout(user.token, 'key-bad-outcome', { paymentOutcome: 'maybe' })).status).toBe(400);
  });

  it('rejects unexpected body fields', async () => {
    const { user } = await cartWith();
    expect((await checkout(user.token, 'key-extra-field', { totalCents: 1 })).status).toBe(400);
  });

  it('rejects an empty cart', async () => {
    const user = await createUser();
    const res = await checkout(user.token, 'key-empty-cart');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CART_EMPTY');
  });
});

describe('POST /api/orders/checkout — outcomes', () => {
  it('creates a paid order with server-computed totals (201)', async () => {
    const { user, product } = await cartWith(5, 2, 2500);
    const res = await checkout(user.token, 'key-success-01');

    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ status: 'paid', subtotalCents: 5000, discountCents: 0, totalCents: 5000 });
    expect(await stockOf(product.id)).toBe(3);
  });

  it('returns 402 for a declined payment, keeps the cart and stock (REQ-CHK-4)', async () => {
    const { user, product } = await cartWith();
    const res = await checkout(user.token, 'key-declined-01', { paymentOutcome: 'declined' });

    expect(res.status).toBe(402);
    expect(res.body.error).toMatchObject({ code: 'PAYMENT_DECLINED', details: { orderId: expect.any(String) } });
    expect(await stockOf(product.id)).toBe(5);
    expect(await countRows('cart_items')).toBe(1);
  });

  it('returns 409 INSUFFICIENT_STOCK when stock dropped after the item was carted (REQ-CHK-3)', async () => {
    const { user, product } = await cartWith(5, 3);
    await pool.query('UPDATE products SET stock = 1 WHERE id = $1', [product.id]);

    const res = await checkout(user.token, 'key-stock-drop-1');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await countRows('orders')).toBe(0);
  });
});

describe('POST /api/orders/checkout — idempotency (REQ-CHK-2)', () => {
  it('returns the same order with Idempotent-Replay on a repeated key', async () => {
    const { user, product } = await cartWith();
    const first = await checkout(user.token, 'key-replay-api-1');
    const second = await checkout(user.token, 'key-replay-api-1');

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.headers['idempotent-replay']).toBe('true');
    expect(second.body.order.id).toBe(first.body.order.id);
    expect(await countRows('orders')).toBe(1);
    expect(await stockOf(product.id)).toBe(3);
  });

  it('creates one order when the same request is fired twice at once', async () => {
    const { user, product } = await cartWith();
    const [r1, r2] = await Promise.all([
      checkout(user.token, 'key-parallel-001'),
      checkout(user.token, 'key-parallel-001'),
    ]);

    expect([r1.status, r2.status].sort()).toEqual([200, 201]);
    expect(r1.body.order.id).toBe(r2.body.order.id);
    expect(await countRows('orders')).toBe(1);
    expect(await stockOf(product.id)).toBe(3);
  });

  it('scopes keys per user: the same key from another user is a separate order', async () => {
    const a = await cartWith();
    const b = await cartWith();
    const [ra, rb] = [await checkout(a.user.token, 'shared-key-0001'), await checkout(b.user.token, 'shared-key-0001')];
    expect([ra.status, rb.status]).toEqual([201, 201]);
    expect(ra.body.order.id).not.toBe(rb.body.order.id);
  });
});
