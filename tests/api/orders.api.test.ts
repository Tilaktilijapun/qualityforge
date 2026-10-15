import { describe, expect, it } from 'vitest';
import { createAdmin, createProduct, createUser, placeOrder, stockOf } from '@testdata/factories';
import { api, bearer } from '../helpers/app';

describe('customer order endpoints', () => {
  it('lists only my orders, newest first, with items', async () => {
    const user = await createUser();
    const p = await createProduct({ stock: 10 });
    const first = await placeOrder(user, [{ product: p, qty: 1 }]);
    const second = await placeOrder(user, [{ product: p, qty: 2 }]);

    const res = await api().get('/api/orders').set(bearer(user.token));
    expect(res.status).toBe(200);
    expect(res.body.items.map((o: any) => o.id)).toEqual([second.id, first.id]);
    expect(res.body.items[0].items[0]).toMatchObject({ productId: p.id, quantity: 2 });
  });

  it('cancels my paid order, restores stock, and refuses a second cancel (REQ-ORD-1/2)', async () => {
    const user = await createUser();
    const p = await createProduct({ stock: 10 });
    const order = await placeOrder(user, [{ product: p, qty: 4 }]);
    expect(await stockOf(p.id)).toBe(6);

    const cancel = await api().post(`/api/orders/${order.id}/cancel`).set(bearer(user.token));
    expect(cancel.status).toBe(200);
    expect(cancel.body.order.status).toBe('cancelled');
    expect(await stockOf(p.id)).toBe(10);

    const again = await api().post(`/api/orders/${order.id}/cancel`).set(bearer(user.token));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_ORDER_TRANSITION');
    expect(await stockOf(p.id)).toBe(10);
  });

  it('returns 400 for a malformed order id and 404 for an unknown one', async () => {
    const user = await createUser();
    expect((await api().get('/api/orders/nope').set(bearer(user.token))).status).toBe(400);
    expect((await api().get('/api/orders/00000000-0000-4000-8000-000000000000').set(bearer(user.token))).status).toBe(404);
  });
});

describe('admin order endpoints', () => {
  it('lists all orders and filters by status', async () => {
    const [u1, u2, admin] = [await createUser(), await createUser(), await createAdmin()];
    const p = await createProduct({ stock: 10 });
    const keep = await placeOrder(u1, [{ product: p, qty: 1 }]);
    const cancelled = await placeOrder(u2, [{ product: p, qty: 1 }]);
    await api().post(`/api/orders/${cancelled.id}/cancel`).set(bearer(u2.token));

    const all = await api().get('/api/admin/orders').set(bearer(admin.token));
    expect(all.body.total).toBe(2);

    const paid = await api().get('/api/admin/orders?status=paid').set(bearer(admin.token));
    expect(paid.body.items.map((o: any) => o.id)).toEqual([keep.id]);
  });

  it('rejects an invalid status filter', async () => {
    const admin = await createAdmin();
    expect((await api().get('/api/admin/orders?status=shipped').set(bearer(admin.token))).status).toBe(400);
  });

  it('refunds a paid order, restores stock, and refuses a second refund', async () => {
    const [user, admin] = [await createUser(), await createAdmin()];
    const p = await createProduct({ stock: 10 });
    const order = await placeOrder(user, [{ product: p, qty: 3 }]);

    const refund = await api().post(`/api/admin/orders/${order.id}/refund`).set(bearer(admin.token));
    expect(refund.status).toBe(200);
    expect(refund.body.order.status).toBe('refunded');
    expect(await stockOf(p.id)).toBe(10);

    const again = await api().post(`/api/admin/orders/${order.id}/refund`).set(bearer(admin.token));
    expect(again.status).toBe(409);
    expect(await stockOf(p.id)).toBe(10);
  });

  it('returns 404 when refunding an unknown order', async () => {
    const admin = await createAdmin();
    const res = await api().post('/api/admin/orders/00000000-0000-4000-8000-000000000000/refund').set(bearer(admin.token));
    expect(res.status).toBe(404);
  });
});
