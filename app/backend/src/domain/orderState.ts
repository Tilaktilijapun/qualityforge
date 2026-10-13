import { AppError } from '../errors';

/** REQ-ORD-1: paid orders may be cancelled (by owner) or refunded (by admin). All other states are terminal. */
export type OrderStatus = 'paid' | 'payment_failed' | 'cancelled' | 'refunded';

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  paid: ['cancelled', 'refunded'],
  payment_failed: [],
  cancelled: [],
  refunded: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw AppError.conflict('INVALID_ORDER_TRANSITION', `Cannot change order from '${from}' to '${to}'`, { from, to });
  }
}
