import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { AppError, ah } from '../errors';
import { authenticate } from '../middleware/auth';
import { checkout, getOrderForActor, listOrdersForUser, transitionOrder } from '../services/orders.service';

const idParam = z.string().uuid();
const idemKey = z.string().trim().min(8).max(100);
const checkoutBody = z.object({ paymentOutcome: z.enum(['success', 'declined']).default('success') }).strict();

export const ordersRouter = Router();
ordersRouter.use(authenticate);

ordersRouter.post('/checkout', ah(async (req, res) => {
  const parsedKey = idemKey.safeParse(req.header('Idempotency-Key'));
  if (!parsedKey.success) {
    throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header (8-100 chars) is required');
  }
  const { paymentOutcome } = checkoutBody.parse(req.body ?? {});
  if (paymentOutcome !== 'success' && !config.allowSimulatedOutcomes) {
    throw AppError.validation('Simulated payment outcomes are disabled in this environment');
  }

  const { order, replayed } = await checkout(req.user!.id, parsedKey.data, paymentOutcome);
  if (replayed) res.setHeader('Idempotent-Replay', 'true');

  if (order.status === 'payment_failed') {
    return res.status(402).json({
      error: { code: 'PAYMENT_DECLINED', message: 'Payment was declined', details: { orderId: order.id } },
    });
  }
  res.status(replayed ? 200 : 201).json({ order });
}));

ordersRouter.get('/', ah(async (req, res) => { res.json({ items: await listOrdersForUser(req.user!.id) }); }));

ordersRouter.get('/:id', ah(async (req, res) => {
  res.json({ order: await getOrderForActor(idParam.parse(req.params.id), req.user!) });
}));

ordersRouter.post('/:id/cancel', ah(async (req, res) => {
  res.json({ order: await transitionOrder(idParam.parse(req.params.id), 'cancelled', req.user!) });
}));
