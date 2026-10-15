import { describe, expect, it } from 'vitest';
import { createProduct, createUser } from '@testdata/factories';
import { api, bearer } from '../helpers/app';

const put = (token: string, productId: string, body: unknown) =>
  api().put(`/api/cart/items/${productId}`).set(bearer(token)).send(body as object);

describe('PUT /api/cart/items/:productId (REQ-CART-1)', () => {
  it('adds an item and returns priced totals', async () => {
    const user = await createUser();
    const p = await createProduct({ priceCents: 1500, stock: 10 });

    const res = await put(user.token, p.id, { quantity: 3 });
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({ productId: p.id, quantity: 3, unitPriceCents: 1500, lineTotalCents: 4500 });
    expect(res.body).toMatchObject({ subtotalCents: 4500, discountCents: 0, totalCents: 4500 });
  });

  it('sets the quantity rather than adding to it', async () => {
    const user = await createUser();
    const p = await createProduct({ stock: 10 });
    await put(user.token, p.id, { quantity: 2 });
    const res = await put(user.token, p.id, { quantity: 3 });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].quantity).toBe(3);
  });

  it('shows the 10% discount once the subtotal reaches $100 (REQ-CART-2)', async () => {
    const user = await createUser();
    const p = await createProduct({ priceCents: 6000, stock: 10 });
    const res = await put(user.token, p.id, { quantity: 2 });
    expect(res.body).toMatchObject({ subtotalCents: 12000, discountCents: 1200, totalCents: 10800 });
  });

  it.each([
    ['zero', { quantity: 0 }],
    ['above the max of 10', { quantity: 11 }],
    ['negative', { quantity: -1 }],
    ['fractional', { quantity: 1.5 }],
    ['a string', { quantity: '2' }],
    ['missing', {}],
  ])('rejects quantity that is %s', async (_label, body) => {
    const user = await createUser();
    const p = await createProduct({ stock: 50 });
    const res = await put(user.token, p.id, body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses client-supplied prices — the server owns pricing (REQ-CART-3)', async () => {
    const user = await createUser();
    const p = await createProduct({ priceCents: 5000, stock: 10 });
    const res = await put(user.token, p.id, { quantity: 1, priceCents: 1 });
    expect(res.status).toBe(400);
  });

  it('rejects a quantity above current stock and reports availability', async () => {
    const user = await createUser();
    const p = await createProduct({ stock: 2 });
    const res = await put(user.token, p.id, { quantity: 3 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'INSUFFICIENT_STOCK', details: { available: 2 } });
  });

  it('returns 404 for unknown and inactive products', async () => {
    const user = await createUser();
    const hidden = await createProduct({ active: false });
    expect((await put(user.token, hidden.id, { quantity: 1 })).status).toBe(404);
    expect((await put(user.token, '00000000-0000-4000-8000-000000000000', { quantity: 1 })).status).toBe(404);
  });
});

describe('cart isolation and removal', () => {
  it('keeps carts private per user', async () => {
    const [a, b] = [await createUser(), await createUser()];
    const p = await createProduct({ stock: 10 });
    await put(a.token, p.id, { quantity: 2 });

    const res = await api().get('/api/cart').set(bearer(b.token));
    expect(res.body.items).toEqual([]);
  });

  it('removes a single item and clears the whole cart', async () => {
    const user = await createUser();
    const [p1, p2] = [await createProduct({ stock: 5 }), await createProduct({ stock: 5 })];
    await put(user.token, p1.id, { quantity: 1 });
    await put(user.token, p2.id, { quantity: 1 });

    const afterOne = await api().delete(`/api/cart/items/${p1.id}`).set(bearer(user.token));
    expect(afterOne.body.items.map((i: any) => i.productId)).toEqual([p2.id]);

    const cleared = await api().delete('/api/cart').set(bearer(user.token));
    expect(cleared.body).toMatchObject({ items: [], subtotalCents: 0, totalCents: 0 });
  });
});
