import cors from 'cors';
import express from 'express';
import { pool } from './db';
import { AppError, ah, errorHandler } from './errors';
import { adminRouter } from './routes/admin.routes';
import { authRouter } from './routes/auth.routes';
import { cartRouter } from './routes/cart.routes';
import { ordersRouter } from './routes/orders.routes';
import { productsRouter } from './routes/products.routes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  // Health: liveness is trivial; readiness checks the DB but never leaks details.
  app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });
  app.get('/ready', ah(async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  }));

  app.use('/api/auth', authRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/cart', cartRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/admin', adminRouter);

  app.use((_req, _res, next) => next(AppError.notFound('Route')));
  app.use(errorHandler);
  return app;
}
