import { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AppError } from '../errors';

export type Role = 'customer' | 'admin';
export interface AuthUser { id: string; role: Role }

declare module 'express-serve-static-core' {
  interface Request { user?: AuthUser }
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ role: user.role }, config.jwtSecret, {
    subject: user.id,
    expiresIn: config.jwtExpiresIn,
    algorithm: 'HS256',
  });
}

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(AppError.unauthorized());
  try {
    const p = jwt.verify(header.slice(7), config.jwtSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (typeof p.sub !== 'string' || (p.role !== 'customer' && p.role !== 'admin')) throw new Error('bad claims');
    req.user = { id: p.sub, role: p.role };
    next();
  } catch {
    next(AppError.unauthorized('Invalid or expired token'));
  }
};

export const requireRole = (role: Role): RequestHandler => (req, _res, next) =>
  req.user?.role === role ? next() : next(AppError.forbidden());
