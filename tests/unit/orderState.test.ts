import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, type OrderStatus } from '@backend/domain/orderState';
import { AppError } from '@backend/errors';

const ALL: OrderStatus[] = ['paid', 'payment_failed', 'cancelled', 'refunded'];
const ALLOWED = new Set(['paid>cancelled', 'paid>refunded']);

describe('order state machine (REQ-ORD-1)', () => {
  const pairs = ALL.flatMap((from) => ALL.map((to) => [from, to] as const));

  it.each(pairs)('%s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(ALLOWED.has(`${from}>${to}`));
  });

  it.each(['payment_failed', 'cancelled', 'refunded'] as const)('%s is terminal', (from) => {
    expect(ALL.some((to) => canTransition(from, to))).toBe(false);
  });

  it('assertTransition passes silently for a legal move', () => {
    expect(() => assertTransition('paid', 'cancelled')).not.toThrow();
  });

  it('assertTransition throws a 409 INVALID_ORDER_TRANSITION with context', () => {
    try {
      assertTransition('cancelled', 'refunded');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect(err).toMatchObject({
        status: 409,
        code: 'INVALID_ORDER_TRANSITION',
        details: { from: 'cancelled', to: 'refunded' },
      });
    }
  });
});
