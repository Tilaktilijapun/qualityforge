/** Business rules REQ-CART-1..3 — keep this module pure so it is trivially unit-testable. */
export const MIN_QTY_PER_LINE = 1;
export const MAX_QTY_PER_LINE = 10;
export const DISCOUNT_THRESHOLD_CENTS = 10_000; // subtotal >= $100.00
export const DISCOUNT_PERCENT = 10;

export interface PricedLine { unitPriceCents: number; quantity: number }
export interface Totals { subtotalCents: number; discountCents: number; totalCents: number }

export function isValidQuantity(q: unknown): q is number {
  return Number.isInteger(q) && (q as number) >= MIN_QTY_PER_LINE && (q as number) <= MAX_QTY_PER_LINE;
}

/** 10% off (rounded down to a whole cent) when subtotal reaches the threshold. */
export function calculateTotals(lines: PricedLine[]): Totals {
  let subtotalCents = 0;
  for (const l of lines) {
    if (!Number.isInteger(l.unitPriceCents) || l.unitPriceCents < 0) throw new RangeError('Invalid unit price');
    if (!isValidQuantity(l.quantity)) throw new RangeError('Invalid quantity');
    subtotalCents += l.unitPriceCents * l.quantity;
  }
  const discountCents =
    subtotalCents >= DISCOUNT_THRESHOLD_CENTS ? Math.floor((subtotalCents * DISCOUNT_PERCENT) / 100) : 0;
  return { subtotalCents, discountCents, totalCents: subtotalCents - discountCents };
}
