import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { AppError, ah } from '../errors';

export const mapProduct = (r: any) => ({
  id: r.id, sku: r.sku, name: r.name, description: r.description, category: r.category,
  priceCents: r.price_cents, stock: r.stock, inStock: r.stock > 0, active: r.active,
});

const query = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(50).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['name', 'price_asc', 'price_desc', 'newest']).default('name'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
}).refine((v) => v.minPrice === undefined || v.maxPrice === undefined || v.minPrice <= v.maxPrice,
  { message: 'minPrice must not exceed maxPrice', path: ['minPrice'] });

const ORDER_BY = {
  name: 'name ASC, id', price_asc: 'price_cents ASC, id', price_desc: 'price_cents DESC, id', newest: 'created_at DESC, id',
} as const;

export const productsRouter = Router();

productsRouter.get('/', ah(async (req, res) => {
  const f = query.parse(req.query);
  const where = ['active = true'];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace(/\?/g, `$${params.length}`)); };

  if (f.q) add(`(name ILIKE ? ESCAPE '\\' OR description ILIKE ? ESCAPE '\\')`, `%${f.q.replace(/[\\%_]/g, '\\$&')}%`);
  if (f.category) add('category = ?', f.category);
  if (f.minPrice !== undefined) add('price_cents >= ?', f.minPrice);
  if (f.maxPrice !== undefined) add('price_cents <= ?', f.maxPrice);

  const whereSql = where.join(' AND ');
  const total = Number((await pool.query(`SELECT COUNT(*) FROM products WHERE ${whereSql}`, params)).rows[0].count);
  const { rows } = await pool.query(
    `SELECT * FROM products WHERE ${whereSql} ORDER BY ${ORDER_BY[f.sort]} LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`,
    params,
  );
  res.json({ items: rows.map(mapProduct), page: f.page, pageSize: f.pageSize, total });
}));

productsRouter.get('/:id', ah(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const { rows } = await pool.query('SELECT * FROM products WHERE id = $1 AND active = true', [id]);
  if (!rows[0]) throw AppError.notFound('Product');
  res.json({ product: mapProduct(rows[0]) });
}));
