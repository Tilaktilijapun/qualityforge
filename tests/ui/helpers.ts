import { randomUUID } from 'node:crypto';
import type { APIRequestContext, Page } from '@playwright/test';

const API = 'http://localhost:4000/api';
export const ADMIN = { email: 'admin@qualityforge.test', password: 'AdminPass123!' };

export async function adminToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: ADMIN });
  return (await res.json()).token;
}

/** Creates a uniquely named product through the admin API so every test owns its data. */
export async function createProduct(request: APIRequestContext, o: { priceCents?: number; stock?: number } = {}) {
  const token = await adminToken(request);
  const id = randomUUID().slice(0, 8);
  const name = `E2E Widget ${id}`;
  const res = await request.post(`${API}/admin/products`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { sku: `E2E-${id}`, name, category: 'E2E', priceCents: o.priceCents ?? 2500, stock: o.stock ?? 5 },
  });
  return { id: (await res.json()).product.id as string, name };
}

export async function stockOf(request: APIRequestContext, productId: string): Promise<number> {
  return (await (await request.get(`${API}/products/${productId}`)).json()).product.stock;
}

export async function registerViaUi(page: Page): Promise<string> {
  const email = `e2e-${randomUUID()}@qualityforge.test`;
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('E2ePassw0rd!');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('button', { name: 'Sign out' }).waitFor();
  return email;
}

export async function findProduct(page: Page, name: string) {
  await page.goto('/');
  await page.getByLabel('Search').fill(name);
  return page.getByRole('row', { name });
}
