import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { AppError, ah } from '../errors';
import { authenticate } from '../middleware/auth';
import { MAX_QTY_PER_LINE, MIN_QTY_PER_LINE } from '../domain/pricing';
import { getCartView } from '../services/cart.service';

const productId = z.string().uuid();
const body = z.object({ quantity: z.number().int().min(MIN_QTY_PER_LINE).max(MAX_QTY_PER_LINE) }).strict();

export const cartRouter = Router();
cartRouter.use(authenticate);

cartRouter.get('/', ah(async (req, res) => { res.json(await getCartView(pool, req.user!.id)); }));

// REQ-CART-1: set (not add) quantity, 1..10, never above current stock.
cartRouter.put('/items/:productId', ah(async (req, res) => {
  const pid = productId.parse(req.params.productId);
  const { quantity } = body.parse(req.body);
  const { rows } = await pool.query('SELECT stock, active FROM products WHERE id = $1', [pid]);
  if (!rows[0] || !rows[0].active) throw AppError.notFound('Product');
  if (quantity > rows[0].stock) {
    throw AppError.conflict('INSUFFICIENT_STOCK', 'Requested quantity exceeds available stock', { available: rows[0].stock });
  }
  await pool.query(
    `INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1,$2,$3)
     ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
    [req.user!.id, pid, quantity],
  );
  res.json(await getCartView(pool, req.user!.id));
}));

cartRouter.delete('/items/:productId', ah(async (req, res) => {
  const pid = productId.parse(req.params.productId);
  await pool.query('DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2', [req.user!.id, pid]);
  res.json(await getCartView(pool, req.user!.id));
}));

cartRouter.delete('/', ah(async (req, res) => {
  await pool.query('DELETE FROM cart_items WHERE user_id = $1', [req.user!.id]);
  res.json(await getCartView(pool, req.user!.id));
}));
