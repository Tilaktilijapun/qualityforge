import { Db, pool, withTransaction } from '../db';
import { AppError } from '../errors';
import { calculateTotals } from '../domain/pricing';
import { assertTransition, OrderStatus } from '../domain/orderState';
import type { AuthUser } from '../middleware/auth';

export type PaymentOutcome = 'success' | 'declined';

export interface OrderView {
  id: string;
  userId: string;
  status: OrderStatus;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  items: { productId: string; name: string; quantity: number; unitPriceCents: number }[];
  createdAt: string;
  updatedAt: string;
}

const ORDER_COLS = `id, user_id, status, subtotal_cents, discount_cents, total_cents, created_at, updated_at`;

async function loadOrders(db: Db, where: string, params: unknown[], tail = ''): Promise<OrderView[]> {
  const { rows } = await db.query(`SELECT ${ORDER_COLS} FROM orders WHERE ${where} ${tail}`, params);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const items = await db.query(
    `SELECT oi.order_id, oi.product_id, p.name, oi.quantity, oi.unit_price_cents
       FROM order_items oi JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ANY($1::uuid[]) ORDER BY p.name`,
    [ids],
  );
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    status: r.status,
    subtotalCents: r.subtotal_cents,
    discountCents: r.discount_cents,
    totalCents: r.total_cents,
    items: items.rows
      .filter((i) => i.order_id === r.id)
      .map((i) => ({ productId: i.product_id, name: i.name, quantity: i.quantity, unitPriceCents: i.unit_price_cents })),
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
}

export async function getOrderById(db: Db, id: string): Promise<OrderView | null> {
  return (await loadOrders(db, 'id = $1', [id]))[0] ?? null;
}

/** Owner-or-admin read. Non-owners get 404 so order IDs cannot be probed (REQ-AUTHZ-2). */
export async function getOrderForActor(id: string, actor: AuthUser): Promise<OrderView> {
  const order = await getOrderById(pool, id);
  if (!order || (actor.role !== 'admin' && order.userId !== actor.id)) throw AppError.notFound('Order');
  return order;
}

export const listOrdersForUser = (userId: string) =>
  loadOrders(pool, 'user_id = $1', [userId], 'ORDER BY created_at DESC');

export async function listAllOrders(opts: { status?: OrderStatus; page: number; pageSize: number }) {
  const where = opts.status ? 'status = $1' : 'TRUE';
  const params: unknown[] = opts.status ? [opts.status] : [];
  const total = Number((await pool.query(`SELECT COUNT(*) FROM orders WHERE ${where}`, params)).rows[0].count);
  const items = await loadOrders(
    pool, where, params,
    `ORDER BY created_at DESC LIMIT ${opts.pageSize} OFFSET ${(opts.page - 1) * opts.pageSize}`,
  );
  return { items, page: opts.page, pageSize: opts.pageSize, total };
}

/**
 * Checkout (REQ-CHK-1..4). One transaction: serialize per user, replay on repeated idempotency key,
 * price from the DB, atomically reserve stock, record the order, clear the cart.
 * A declined payment records a `payment_failed` order, leaves stock and cart untouched.
 */
export async function checkout(userId: string, idempotencyKey: string, outcome: PaymentOutcome) {
  return withTransaction(async (tx) => {
    // Serialize concurrent checkouts for the same user (prevents double-spend of one cart).
    await tx.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);

    const existing = await tx.query('SELECT id FROM orders WHERE user_id = $1 AND idempotency_key = $2', [userId, idempotencyKey]);
    if (existing.rowCount) {
      return { order: (await getOrderById(tx, existing.rows[0].id))!, replayed: true };
    }

    const cart = await tx.query(
      `SELECT ci.product_id, ci.quantity, p.price_cents, p.active
         FROM cart_items ci JOIN products p ON p.id = ci.product_id
        WHERE ci.user_id = $1 ORDER BY ci.product_id`,
      [userId],
    );
    if (cart.rowCount === 0) throw new AppError(400, 'CART_EMPTY', 'Cannot check out an empty cart');
    const inactive = cart.rows.find((r) => !r.active);
    if (inactive) throw AppError.conflict('PRODUCT_UNAVAILABLE', 'A product in your cart is no longer available', { productId: inactive.product_id });

    const totals = calculateTotals(cart.rows.map((r) => ({ unitPriceCents: r.price_cents, quantity: r.quantity })));
    const status: OrderStatus = outcome === 'success' ? 'paid' : 'payment_failed';

    const inserted = await tx.query(
      `INSERT INTO orders (user_id, status, subtotal_cents, discount_cents, total_cents, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [userId, status, totals.subtotalCents, totals.discountCents, totals.totalCents, idempotencyKey],
    );
    const orderId: string = inserted.rows[0].id;
    for (const r of cart.rows) {
      await tx.query(
        'INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents) VALUES ($1,$2,$3,$4)',
        [orderId, r.product_id, r.quantity, r.price_cents],
      );
    }

    if (status === 'paid') {
      // Product IDs are locked in sorted order, so concurrent checkouts cannot deadlock.
      for (const r of cart.rows) {
        const res = await tx.query(
          'UPDATE products SET stock = stock - $2, updated_at = now() WHERE id = $1 AND stock >= $2',
          [r.product_id, r.quantity],
        );
        if (res.rowCount === 0) {
          throw AppError.conflict('INSUFFICIENT_STOCK', 'Not enough stock to complete this order', { productId: r.product_id });
        }
      }
      await tx.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);
    }
    return { order: (await getOrderById(tx, orderId))!, replayed: false };
  });
}

/** Cancel (owner) or refund (admin). Both restore reserved stock in the same transaction (REQ-ORD-2/3). */
export async function transitionOrder(orderId: string, to: 'cancelled' | 'refunded', actor: AuthUser): Promise<OrderView> {
  return withTransaction(async (tx) => {
    const found = await tx.query('SELECT user_id, status FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    const row = found.rows[0];
    const allowed = row && (to === 'refunded' ? actor.role === 'admin' : row.user_id === actor.id);
    if (!allowed) throw AppError.notFound('Order');

    assertTransition(row.status, to);

    const items = await tx.query(
      'SELECT product_id, quantity FROM order_items WHERE order_id = $1 ORDER BY product_id',
      [orderId],
    );
    for (const i of items.rows) {
      await tx.query('UPDATE products SET stock = stock + $2, updated_at = now() WHERE id = $1', [i.product_id, i.quantity]);
    }
    await tx.query('UPDATE orders SET status = $2, updated_at = now() WHERE id = $1', [orderId, to]);
    return (await getOrderById(tx, orderId))!;
  });
}
