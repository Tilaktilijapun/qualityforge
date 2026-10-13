import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { AppError, ah } from '../errors';
import { authenticate, requireRole } from '../middleware/auth';
import { listAllOrders, transitionOrder } from '../services/orders.service';
import { mapProduct } from './products.routes';

const idParam = z.string().uuid();
const productFields = {
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000),
  category: z.string().trim().min(1).max(50),
  priceCents: z.number().int().min(0).max(100_000_000),
};
const createProduct = z.object({
  sku: z.string().trim().min(1).max(40), ...productFields,
  description: productFields.description.default(''),
  stock: z.number().int().min(0).max(1_000_000),
}).strict();
const updateProduct = z.object({ ...productFields, active: z.boolean() }).partial().strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });
const adjustStock = z.object({ delta: z.number().int().min(-1_000_000).max(1_000_000) }).strict();
const orderQuery = z.object({
  status: z.enum(['paid', 'payment_failed', 'cancelled', 'refunded']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// REQ-AUTHZ-1: every route below requires a valid token AND the admin role.
export const adminRouter = Router();
adminRouter.use(authenticate, requireRole('admin'));

adminRouter.get('/products', ah(async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM products ORDER BY name');
  res.json({ items: rows.map(mapProduct) });
}));

adminRouter.post('/products', ah(async (req, res) => {
  const p = createProduct.parse(req.body);
  try {
    const { rows } = await pool.query(
      `INSERT INTO products (sku, name, description, category, price_cents, stock)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [p.sku, p.name, p.description, p.category, p.priceCents, p.stock],
    );
    res.status(201).json({ product: mapProduct(rows[0]) });
  } catch (err: any) {
    if (err.code === '23505') throw AppError.conflict('SKU_TAKEN', 'A product with this SKU already exists');
    throw err;
  }
}));

adminRouter.patch('/products/:id', ah(async (req, res) => {
  const id = idParam.parse(req.params.id);
  const p = updateProduct.parse(req.body);
  const cols: Record<string, unknown> = {
    name: p.name, description: p.description, category: p.category, price_cents: p.priceCents, active: p.active,
  };
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [col, v] of Object.entries(cols)) {
    if (v !== undefined) { params.push(v); sets.push(`${col} = $${params.length}`); }
  }
  const { rows } = await pool.query(`UPDATE products SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`, params);
  if (!rows[0]) throw AppError.notFound('Product');
  res.json({ product: mapProduct(rows[0]) });
}));

// REQ-INV-1: atomic relative adjustment; stock can never go below zero.
adminRouter.post('/products/:id/inventory', ah(async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { delta } = adjustStock.parse(req.body);
  const { rows } = await pool.query(
    'UPDATE products SET stock = stock + $2, updated_at = now() WHERE id = $1 AND stock + $2 >= 0 RETURNING *',
    [id, delta],
  );
  if (!rows[0]) {
    const exists = await pool.query('SELECT 1 FROM products WHERE id = $1', [id]);
    if (!exists.rowCount) throw AppError.notFound('Product');
    throw AppError.conflict('INSUFFICIENT_STOCK', 'Adjustment would make stock negative');
  }
  res.json({ product: mapProduct(rows[0]) });
}));

adminRouter.get('/orders', ah(async (req, res) => { res.json(await listAllOrders(orderQuery.parse(req.query))); }));

adminRouter.post('/orders/:id/refund', ah(async (req, res) => {
  res.json({ order: await transitionOrder(idParam.parse(req.params.id), 'refunded', req.user!) });
}));
