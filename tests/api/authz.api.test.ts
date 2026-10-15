import { describe, expect, it } from 'vitest';
import { createAdmin, createProduct, createUser, placeOrder, statusOf } from '@testdata/factories';
import { api, bearer } from '../helpers/app';

const ID = '00000000-0000-4000-8000-000000000000';
const ADMIN_ROUTES = [
  ['get', '/api/admin/products'],
  ['post', '/api/admin/products'],
  ['patch', `/api/admin/products/${ID}`],
  ['post', `/api/admin/products/${ID}/inventory`],
  ['get', '/api/admin/orders'],
  ['post', `/api/admin/orders/${ID}/refund`],
] as const;

const CUSTOMER_ROUTES = [
  ['get', '/api/cart'],
  ['put', `/api/cart/items/${ID}`],
  ['delete', '/api/cart'],
  ['get', '/api/orders'],
  ['post', '/api/orders/checkout'],
  ['get', `/api/orders/${ID}`],
  ['post', `/api/orders/${ID}/cancel`],
] as const;

describe('role separation on admin routes (REQ-AUTHZ-1)', () => {
  it.each(ADMIN_ROUTES)('%s %s → 401 without a token', async (method, path) => {
    const res = await api()[method](path);
    expect(res.status).toBe(401);
  });

  it.each(ADMIN_ROUTES)('%s %s → 403 for a customer', async (method, path) => {
    const customer = await createUser();
    const res = await api()[method](path).set(bearer(customer.token)).send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('authentication on customer routes', () => {
  it.each(CUSTOMER_ROUTES)('%s %s → 401 without a token', async (method, path) => {
    expect((await api()[method](path)).status).toBe(401);
  });
});

describe('object-level authorization on orders (REQ-AUTHZ-2)', () => {
  it('hides another customer’s order behind a 404 on read', async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const order = await placeOrder(owner, [{ product: await createProduct(), qty: 1 }]);

    const res = await api().get(`/api/orders/${order.id}`).set(bearer(stranger.token));
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain(owner.id);
  });

  it('does not list other customers’ orders', async () => {
    const owner = await createUser();
    const stranger = await createUser();
    await placeOrder(owner, [{ product: await createProduct(), qty: 1 }]);

    const res = await api().get('/api/orders').set(bearer(stranger.token));
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it('blocks cancelling another customer’s order and leaves it paid', async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const order = await placeOrder(owner, [{ product: await createProduct(), qty: 1 }]);

    const res = await api().post(`/api/orders/${order.id}/cancel`).set(bearer(stranger.token));
    expect(res.status).toBe(404);
    expect(await statusOf(order.id)).toBe('paid');
  });

  it('lets an admin read any customer’s order', async () => {
    const owner = await createUser();
    const admin = await createAdmin();
    const order = await placeOrder(owner, [{ product: await createProduct(), qty: 1 }]);

    const res = await api().get(`/api/orders/${order.id}`).set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.order.userId).toBe(owner.id);
  });
});
