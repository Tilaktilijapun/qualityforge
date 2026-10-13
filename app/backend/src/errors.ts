import { ErrorRequestHandler, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
  static validation(message: string, details?: unknown) { return new AppError(400, 'VALIDATION_ERROR', message, details); }
  static unauthorized(message = 'Authentication required') { return new AppError(401, 'UNAUTHORIZED', message); }
  static forbidden(message = 'You do not have permission to perform this action') { return new AppError(403, 'FORBIDDEN', message); }
  static notFound(what = 'Resource') { return new AppError(404, 'NOT_FOUND', `${what} not found`); }
  static conflict(code: string, message: string, details?: unknown) { return new AppError(409, code, message, details); }
}

/** Express 4 does not catch rejected promises; this forwards them to the error handler. */
export const ah =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res).catch(next); };

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' } });
  }
  console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' } });
};
