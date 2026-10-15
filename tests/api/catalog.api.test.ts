import { describe, expect, it } from 'vitest';
import { createProduct } from '@testdata/factories';
import { api } from '../helpers/app';

const names = (res: any) => res.body.items.map((i: any) => i.name);

describe('GET /api/products (REQ-CAT-1)', () => {
  it('returns only active products with stock visibility', async () => {
    await createProduct({ name: 'Visible', stock: 5 });
    await createProduct({ name: 'Sold Out', stock: 0 });
    await createProduct({ name: 'Hidden', active: false });

    const res = await api().get('/api/products');
    expect(res.status).toBe(200);
    expect(names(res)).toEqual(['Sold Out', 'Visible']);
    const byName = Object.fromEntries(res.body.items.map((i: any) => [i.name, i]));
    expect(byName['Visible']).toMatchObject({ stock: 5, inStock: true });
    expect(byName['Sold Out']).toMatchObject({ stock: 0, inStock: false });
  });

  it('searches name and description case-insensitively', async () => {
    await createProduct({ name: 'Alpha Keyboard' });
    await createProduct({ name: 'Beta Mouse', description: 'A wireless KEYBOARD companion' });
    await createProduct({ name: 'Gamma Monitor' });

    expect(names(await api().get('/api/products?q=keyboard'))).toEqual(['Alpha Keyboard', 'Beta Mouse']);
  });

  it.each(['%', '_', '\\'])('treats %j in the search term literally, not as a wildcard', async (q) => {
    await createProduct({ name: 'Plain Product' });
    const res = await api().get('/api/products').query({ q });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it('filters by category and by price range (inclusive)', async () => {
    await createProduct({ name: 'Cheap Audio', category: 'Audio', priceCents: 500 });
    await createProduct({ name: 'Mid Audio', category: 'Audio', priceCents: 1000 });
    await createProduct({ name: 'Mid Office', category: 'Office', priceCents: 1000 });
    await createProduct({ name: 'Pricey Audio', category: 'Audio', priceCents: 5000 });

    expect(names(await api().get('/api/products?category=Audio&minPrice=1000&maxPrice=5000')))
      .toEqual(['Mid Audio', 'Pricey Audio']);
  });

  it('sorts by price ascending and descending', async () => {
    await createProduct({ name: 'B', priceCents: 200 });
    await createProduct({ name: 'A', priceCents: 300 });
    await createProduct({ name: 'C', priceCents: 100 });

    expect(names(await api().get('/api/products?sort=price_asc'))).toEqual(['C', 'B', 'A']);
    expect(names(await api().get('/api/products?sort=price_desc'))).toEqual(['A', 'B', 'C']);
  });

  it('paginates and reports the full total', async () => {
    for (const n of ['P1', 'P2', 'P3', 'P4', 'P5']) await createProduct({ name: n });

    const res = await api().get('/api/products?pageSize=2&page=3');
    expect(res.body).toMatchObject({ page: 3, pageSize: 2, total: 5 });
    expect(names(res)).toEqual(['P5']);
  });

  it('returns an empty page (not an error) beyond the last page', async () => {
    await createProduct();
    const res = await api().get('/api/products?page=99');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(1);
  });

  it.each([
    ['pageSize above the cap', 'pageSize=51'],
    ['pageSize zero', 'pageSize=0'],
    ['page zero', 'page=0'],
    ['unknown sort', 'sort=cheapest'],
    ['negative price', 'minPrice=-1'],
    ['minPrice > maxPrice', 'minPrice=500&maxPrice=100'],
    ['non-numeric price', 'maxPrice=abc'],
  ])('rejects %s with 400', async (_label, qs) => {
    const res = await api().get(`/api/products?${qs}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('is not vulnerable to SQL injection through the search term', async () => {
    await createProduct({ name: 'Safe' });
    const res = await api().get('/api/products').query({ q: "'; DROP TABLE products; --" });
    expect(res.status).toBe(200);
    expect((await api().get('/api/products')).body.total).toBe(1);
  });
});

describe('GET /api/products/:id', () => {
  it('returns one product', async () => {
    const p = await createProduct({ name: 'Solo', priceCents: 1234 });
    const res = await api().get(`/api/products/${p.id}`);
    expect(res.status).toBe(200);
    expect(res.body.product).toMatchObject({ id: p.id, name: 'Solo', priceCents: 1234 });
  });

  it('returns 404 for unknown and inactive products', async () => {
    const hidden = await createProduct({ active: false });
    expect((await api().get(`/api/products/${hidden.id}`)).status).toBe(404);
    expect((await api().get('/api/products/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });

  it('returns 400 for a malformed id', async () => {
    expect((await api().get('/api/products/not-a-uuid')).status).toBe(400);
  });
});
