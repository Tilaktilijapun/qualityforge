import { describe, expect, it } from 'vitest';
import {
  calculateTotals, DISCOUNT_THRESHOLD_CENTS, isValidQuantity, MAX_QTY_PER_LINE, MIN_QTY_PER_LINE,
} from '@backend/domain/pricing';

describe('isValidQuantity (REQ-CART-1)', () => {
  it.each([
    [MIN_QTY_PER_LINE, true],
    [5, true],
    [MAX_QTY_PER_LINE, true],
    [0, false],
    [MAX_QTY_PER_LINE + 1, false],
    [-1, false],
    [1.5, false],
    [Number.NaN, false],
    ['5', false],
    [null, false],
  ])('isValidQuantity(%j) → %s', (input, expected) => {
    expect(isValidQuantity(input)).toBe(expected);
  });
});

describe('calculateTotals (REQ-CART-2)', () => {
  it('returns zeros for an empty cart', () => {
    expect(calculateTotals([])).toEqual({ subtotalCents: 0, discountCents: 0, totalCents: 0 });
  });

  it('sums unit price × quantity across lines', () => {
    const t = calculateTotals([{ unitPriceCents: 1500, quantity: 2 }, { unitPriceCents: 250, quantity: 4 }]);
    expect(t.subtotalCents).toBe(4000);
  });

  it('gives no discount one cent below the threshold', () => {
    const t = calculateTotals([{ unitPriceCents: DISCOUNT_THRESHOLD_CENTS - 1, quantity: 1 }]);
    expect(t).toEqual({ subtotalCents: 9999, discountCents: 0, totalCents: 9999 });
  });

  it('gives 10% off exactly at the threshold', () => {
    const t = calculateTotals([{ unitPriceCents: DISCOUNT_THRESHOLD_CENTS, quantity: 1 }]);
    expect(t).toEqual({ subtotalCents: 10000, discountCents: 1000, totalCents: 9000 });
  });

  it('rounds the discount down to a whole cent', () => {
    // 3335 × 3 = 10005 → 10% = 1000.5 → 1000
    const t = calculateTotals([{ unitPriceCents: 3335, quantity: 3 }]);
    expect(t.discountCents).toBe(1000);
    expect(t.totalCents).toBe(9005);
  });

  it('keeps total = subtotal − discount for a mixed cart', () => {
    const t = calculateTotals([{ unitPriceCents: 27900, quantity: 1 }, { unitPriceCents: 1200, quantity: 3 }]);
    expect(t.subtotalCents).toBe(31500);
    expect(t.totalCents).toBe(t.subtotalCents - t.discountCents);
    expect(t.discountCents).toBe(3150);
  });

  it('allows free (0-cent) items', () => {
    expect(calculateTotals([{ unitPriceCents: 0, quantity: 3 }]).totalCents).toBe(0);
  });

  it.each([0, 11, 1.5, -2])('rejects invalid quantity %s', (quantity) => {
    expect(() => calculateTotals([{ unitPriceCents: 100, quantity }])).toThrow(RangeError);
  });

  it.each([-1, 9.99, Number.NaN])('rejects invalid unit price %s', (unitPriceCents) => {
    expect(() => calculateTotals([{ unitPriceCents, quantity: 1 }])).toThrow(RangeError);
  });
});
