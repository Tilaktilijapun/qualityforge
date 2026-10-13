import { Db } from '../db';
import { calculateTotals } from '../domain/pricing';

export async function getCartView(db: Db, userId: string) {
  const { rows } = await db.query(
    `SELECT ci.product_id, ci.quantity, p.sku, p.name, p.price_cents, p.stock, p.active
       FROM cart_items ci JOIN products p ON p.id = ci.product_id
      WHERE ci.user_id = $1 ORDER BY p.name`,
    [userId],
  );
  const items = rows.map((r) => ({
    productId: r.product_id as string,
    sku: r.sku as string,
    name: r.name as string,
    unitPriceCents: r.price_cents as number,
    quantity: r.quantity as number,
    lineTotalCents: (r.price_cents as number) * (r.quantity as number),
    available: r.active && r.stock >= r.quantity,
  }));
  const totals = calculateTotals(items.map((i) => ({ unitPriceCents: i.unitPriceCents, quantity: i.quantity })));
  return { items, ...totals };
}
