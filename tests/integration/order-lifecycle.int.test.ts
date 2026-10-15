import { describe, expect, it } from 'vitest';
import { checkout, transitionOrder } from '@backend/services/orders.service';
import { addToCart, createAdmin, createProduct, createUser, placeOrder, statusOf, stockOf } from '@testdata/factories';

async function paidOrder(qty = 3, stock = 10) {
  const owner = await createUser();
  const product = await createProduct({ stock });
  const order = await placeOrder(owner, [{ product, qty }]);
  return { owner, product, order, remaining: stock - qty };
}

describe('cancel (REQ-ORD-1/2)', () => {
  it('restores stock and marks the order cancelled', async () => {
    const { owner, product, order, remaining } = await paidOrder();
    expect(await stockOf(product.id)).toBe(remaining);

    const result = await transitionOrder(order.id, 'cancelled', { id: owner.id, role: 'customer' });

    expect(result.status).toBe('cancelled');
    expect(await stockOf(product.id)).toBe(10);
  });

  it('refuses a second cancel and restores stock only once', async () => {
    const { owner, product, order } = await paidOrder();
    const actor = { id: owner.id, role: 'customer' as const };
    await transitionOrder(order.id, 'cancelled', actor);

    await expect(transitionOrder(order.id, 'cancelled', actor)).rejects.toMatchObject({ code: 'INVALID_ORDER_TRANSITION' });
    expect(await stockOf(product.id)).toBe(10);
  });

  it('hides orders from non-owners (404) and changes nothing (REQ-AUTHZ-2)', async () => {
    const { product, order, remaining } = await paidOrder();
    const stranger = await createUser();

    await expect(transitionOrder(order.id, 'cancelled', { id: stranger.id, role: 'customer' }))
      .rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(await statusOf(order.id)).toBe('paid');
    expect(await stockOf(product.id)).toBe(remaining);
  });

  it('lets exactly one of two concurrent cancels win; stock is restored once', async () => {
    const { owner, product, order } = await paidOrder();
    const actor = { id: owner.id, role: 'customer' as const };

    const results = await Promise.allSettled([
      transitionOrder(order.id, 'cancelled', actor),
      transitionOrder(order.id, 'cancelled', actor),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'INVALID_ORDER_TRANSITION' });
    expect(await stockOf(product.id)).toBe(10);
  });

  it('cannot cancel a payment_failed order', async () => {
    const owner = await createUser();
    const product = await createProduct({ stock: 5 });
    await addToCart(owner.id, product.id, 1);
    const { order } = await checkout(owner.id, 'key-failed-order', 'declined');

    await expect(transitionOrder(order.id, 'cancelled', { id: owner.id, role: 'customer' }))
      .rejects.toMatchObject({ code: 'INVALID_ORDER_TRANSITION' });
  });
});

describe('refund (REQ-ORD-1/2)', () => {
  it('lets an admin refund a paid order and restores stock', async () => {
    const { product, order } = await paidOrder();
    const admin = await createAdmin();

    const result = await transitionOrder(order.id, 'refunded', { id: admin.id, role: 'admin' });

    expect(result.status).toBe('refunded');
    expect(await stockOf(product.id)).toBe(10);
  });

  it('refuses a refund by a non-admin at the service layer', async () => {
    const { owner, order } = await paidOrder();
    await expect(transitionOrder(order.id, 'refunded', { id: owner.id, role: 'customer' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await statusOf(order.id)).toBe('paid');
  });

  it('cannot refund an already cancelled order', async () => {
    const { owner, order } = await paidOrder();
    const admin = await createAdmin();
    await transitionOrder(order.id, 'cancelled', { id: owner.id, role: 'customer' });

    await expect(transitionOrder(order.id, 'refunded', { id: admin.id, role: 'admin' }))
      .rejects.toMatchObject({ code: 'INVALID_ORDER_TRANSITION' });
  });
});
