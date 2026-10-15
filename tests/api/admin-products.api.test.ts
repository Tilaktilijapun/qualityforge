import { describe, expect, it } from 'vitest';
import { createAdmin, createProduct, stockOf } from '@testdata/factories';
import { api, bearer } from '../helpers/app';

const valid = { sku: 'NEW-001', name: 'New Item', category: 'Test', priceCents: 1999, stock: 5 };

describe('POST /api/admin/products', () => {
  it('creates a product visible in the public catalog', async () => {
    const admin = await createAdmin();
    const res = await api().post('/api/admin/products').set(bearer(admin.token)).send(valid);
    expect(res.status).toBe(201);
    expect(res.body.product).toMatchObject({ sku: 'NEW-001', priceCents: 1999, stock: 5, active: true });
    expect((await api().get(`/api/products/${res.body.product.id}`)).status).toBe(200);
  });

  it('rejects a duplicate SKU with 409 SKU_TAKEN', async () => {
    const admin = await createAdmin();
    await createProduct({ sku: 'NEW-001' });
    const res = await api().post('/api/admin/products').set(bearer(admin.token)).send(valid);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SKU_TAKEN');
  });

  it.each([
    ['negative price', { priceCents: -1 }],
    ['fractional price', { priceCents: 9.99 }],
    ['negative stock', { stock: -1 }],
    ['empty name', { name: '' }],
    ['missing sku', { sku: undefined }],
    ['unknown field', { isAdmin: true }],
  ])('rejects %s', async (_label, override) => {
    const admin = await createAdmin();
    const res = await api().post('/api/admin/products').set(bearer(admin.token)).send({ ...valid, ...override });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /api/admin/products/:id', () => {
  it('updates fields and leaves the rest untouched', async () => {
    const admin = await createAdmin();
    const p = await createProduct({ name: 'Old', priceCents: 1000, stock: 7 });
    const res = await api().patch(`/api/admin/products/${p.id}`).set(bearer(admin.token)).send({ name: 'Renamed', priceCents: 1500 });
    expect(res.status).toBe(200);
    expect(res.body.product).toMatchObject({ name: 'Renamed', priceCents: 1500, stock: 7 });
  });

  it('deactivating a product removes it from the public catalog', async () => {
    const admin = await createAdmin();
    const p = await createProduct();
    await api().patch(`/api/admin/products/${p.id}`).set(bearer(admin.token)).send({ active: false });
    expect((await api().get(`/api/products/${p.id}`)).status).toBe(404);
  });

  it('rejects an empty body and unknown ids', async () => {
    const admin = await createAdmin();
    const p = await createProduct();
    expect((await api().patch(`/api/admin/products/${p.id}`).set(bearer(admin.token)).send({})).status).toBe(400);
    expect((await api().patch('/api/admin/products/00000000-0000-4000-8000-000000000000').set(bearer(admin.token)).send({ name: 'x' })).status).toBe(404);
  });
});

describe('POST /api/admin/products/:id/inventory (REQ-INV-1)', () => {
  const adjust = (token: string, id: string, body: object) =>
    api().post(`/api/admin/products/${id}/inventory`).set(bearer(token)).send(body);

  it('applies positive and negative deltas', async () => {
    const admin = await createAdmin();
    const p = await createProduct({ stock: 10 });
    expect((await adjust(admin.token, p.id, { delta: 5 })).body.product.stock).toBe(15);
    expect((await adjust(admin.token, p.id, { delta: -15 })).body.product.stock).toBe(0);
  });

  it('refuses an adjustment that would make stock negative and changes nothing', async () => {
    const admin = await createAdmin();
    const p = await createProduct({ stock: 3 });
    const res = await adjust(admin.token, p.id, { delta: -4 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await stockOf(p.id)).toBe(3);
  });

  it('is atomic under concurrent decrements — stock never goes below zero', async () => {
    const admin = await createAdmin();
    const p = await createProduct({ stock: 5 });
    const results = await Promise.all(Array.from({ length: 10 }, () => adjust(admin.token, p.id, { delta: -1 })));

    expect(results.filter((r) => r.status === 200)).toHaveLength(5);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    expect(await stockOf(p.id)).toBe(0);
  });

  it.each([[{ delta: 1.5 }], [{ delta: '2' }], [{}], [{ stock: 5 }]])('rejects invalid body %j', async (body) => {
    const admin = await createAdmin();
    const p = await createProduct();
    expect((await adjust(admin.token, p.id, body)).status).toBe(400);
  });

  it('returns 404 for an unknown product', async () => {
    const admin = await createAdmin();
    expect((await adjust(admin.token, '00000000-0000-4000-8000-000000000000', { delta: 1 })).status).toBe(404);
  });
});
