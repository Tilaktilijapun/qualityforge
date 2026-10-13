import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db';
import { config } from '../config';
import { AppError, ah } from '../errors';
import { authenticate, signToken } from '../middleware/auth';

const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(72), // bcrypt ignores bytes beyond 72
});

// Valid-format hash used to equalize timing when the email is unknown.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', config.bcryptCost);

export const authRouter = Router();

// REQ-AUTH-1: self-registration always creates a customer; admins are provisioned out-of-band.
authRouter.post('/register', ah(async (req, res) => {
  const { email, password } = credentials.parse(req.body);
  const hash = await bcrypt.hash(password, config.bcryptCost);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, role`, [email, hash]);
    const user = rows[0];
    res.status(201).json({ user, token: signToken({ id: user.id, role: user.role }) });
  } catch (err: any) {
    if (err.code === '23505') throw AppError.conflict('EMAIL_TAKEN', 'An account with this email already exists');
    throw err;
  }
}));

// REQ-AUTH-2: identical response for unknown email and wrong password.
authRouter.post('/login', ah(async (req, res) => {
  const { email, password } = credentials.parse(req.body);
  const { rows } = await pool.query('SELECT id, email, role, password_hash FROM users WHERE lower(email) = $1', [email]);
  const row = rows[0];
  const ok = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  res.json({ user: { id: row.id, email: row.email, role: row.role }, token: signToken({ id: row.id, role: row.role }) });
}));

authRouter.get('/me', authenticate, ah(async (req, res) => {
  const { rows } = await pool.query('SELECT id, email, role FROM users WHERE id = $1', [req.user!.id]);
  if (!rows[0]) throw AppError.unauthorized('Account no longer exists');
  res.json({ user: rows[0] });
}));
