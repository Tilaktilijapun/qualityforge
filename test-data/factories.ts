/** Synthetic data factories. Every call creates fresh, uniquely named rows — no shared mutable accounts. */
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { pool } from '@backend/db';
import { signToken, type Role } from '@backend/middleware/auth';
import { checkout, type OrderView } from '@backend/services/orders.service';

export interface TestUser { id: string; email: string; password: string; role: Role; token: string }
export interface TestProduct { id: string; sku: string; name: string; priceCents: number; stock: number }

export async function createUser(o: { role?: Role; email?: string; password?: string } = {}): Promise<TestUser> {
  const password = o.password ?? 'TestPass123!';
  const email = (o.email ?? `user-${randomUUID()}@qualityforge.test`).toLowerCase();
  const role = o.role ?? 'customer';
  const { rows } = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1,$2,$3) RETURNING id',
    [email, await bcrypt.hash(password, 4), role],
  );
  const id: string = rows[0].id;
  return { id, email, password, role, token: signToken({ id, role }) };
}

export const createAdmin = () => createUser({ role: 'admin' });

export async function createProduct(
  o: Partial<{ id: string; sku: string; name: string; description: string; category: string; priceCents: number; stock: number; active: boolean }> = {},
): Promise<TestProduct> {
  const uid = randomUUID().slice(0, 8);
  const p = {
    sku: o.sku ?? `SKU-${uid}`,
    name: o.name ?? `Product ${uid}`,
    description: o.description ?? '',
    category: o.category ?? 'Test',
    priceCents: o.priceCents ?? 1000,
    stock: o.stock ?? 10,
    active: o.active ?? true,
  };
  const { rows } = await pool.query(
    `INSERT INTO products (id, sku, name, description, category, price_cents, stock, active)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [o.id ?? null, p.sku, p.name, p.description, p.category, p.priceCents, p.stock, p.active],
  );
  return { id: rows[0].id, sku: p.sku, name: p.name, priceCents: p.priceCents, stock: p.stock };
}

/** Direct DB insert, bypassing API rules — lets tests build states the API would refuse (e.g. qty > stock). */
export async function addToCart(userId: string, productId: string, quantity: number): Promise<void> {
  await pool.query(
    `INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1,$2,$3)
     ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
    [userId, productId, quantity],
  );
}

/** Fills the cart and runs a successful checkout through the service layer. */
export async function placeOrder(
  user: TestUser,
  lines: { product: TestProduct; qty: number }[],
  key: string = randomUUID(),
): Promise<OrderView> {
  for (const l of lines) await addToCart(user.id, l.product.id, l.qty);
  const { order } = await checkout(user.id, key, 'success');
  return order;
}

export async function stockOf(productId: string): Promise<number> {
  return (await pool.query('SELECT stock FROM products WHERE id = $1', [productId])).rows[0].stock;
}

export async function countRows(table: 'orders' | 'order_items' | 'cart_items' | 'users' | 'products'): Promise<number> {
  return Number((await pool.query(`SELECT COUNT(*) FROM ${table}`)).rows[0].count);
}

export async function statusOf(orderId: string): Promise<string> {
  return (await pool.query('SELECT status FROM orders WHERE id = $1', [orderId])).rows[0].status;
}
