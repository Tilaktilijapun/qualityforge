import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { config } from '@backend/config';
import { pool } from '@backend/db';
import { createUser } from '@testdata/factories';
import { api, bearer } from '../helpers/app';

const register = (body: unknown) => api().post('/api/auth/register').send(body as object);
const login = (body: unknown) => api().post('/api/auth/login').send(body as object);

describe('POST /api/auth/register', () => {
  it('creates a customer and returns a token without leaking secrets (REQ-AUTH-1)', async () => {
    const res = await register({ email: 'new@qualityforge.test', password: 'GoodPass123' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'new@qualityforge.test', role: 'customer' });
    expect(res.body.token).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);

    const stored = await pool.query('SELECT password_hash FROM users WHERE email = $1', ['new@qualityforge.test']);
    expect(stored.rows[0].password_hash).not.toBe('GoodPass123');
  });

  it('ignores a client-supplied role — no privilege escalation (REQ-AUTH-1)', async () => {
    const res = await register({ email: 'sneaky@qualityforge.test', password: 'GoodPass123', role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('customer');
  });

  it('normalises email case and rejects duplicates case-insensitively', async () => {
    await register({ email: 'Dup@QualityForge.test', password: 'GoodPass123' });
    const res = await register({ email: 'dup@qualityforge.TEST', password: 'GoodPass123' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it.each([
    ['short password', { email: 'a@qualityforge.test', password: 'short' }, 'password'],
    ['72+ char password', { email: 'a@qualityforge.test', password: 'x'.repeat(73) }, 'password'],
    ['invalid email', { email: 'not-an-email', password: 'GoodPass123' }, 'email'],
    ['missing email', { password: 'GoodPass123' }, 'email'],
    ['non-string password', { email: 'a@qualityforge.test', password: 12345678 }, 'password'],
  ])('rejects %s with field-level details', async (_label, body, field) => {
    const res = await register(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: any) => d.path)).toContain(field);
  });

  it('rejects malformed JSON with INVALID_JSON', async () => {
    const res = await api().post('/api/auth/register').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('POST /api/auth/login', () => {
  it('returns a token for valid credentials', async () => {
    const user = await createUser({ password: 'RightPass123' });
    const res = await login({ email: user.email, password: 'RightPass123' });
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('gives an identical 401 for wrong password and unknown email (REQ-AUTH-2)', async () => {
    const user = await createUser({ password: 'RightPass123' });
    const wrongPw = await login({ email: user.email, password: 'WrongPass123' });
    const unknown = await login({ email: 'ghost@qualityforge.test', password: 'WrongPass123' });

    expect(wrongPw.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrongPw.body);
  });
});

describe('token handling on GET /api/auth/me', () => {
  it('rejects a missing token', async () => {
    expect((await api().get('/api/auth/me')).status).toBe(401);
  });

  it('rejects garbage, wrong-secret and expired tokens', async () => {
    const user = await createUser();
    const wrongSecret = jwt.sign({ role: 'customer' }, 'another-secret', { subject: user.id });
    const expired = jwt.sign({ role: 'customer' }, config.jwtSecret, { subject: user.id, expiresIn: -10 });

    for (const token of ['garbage', wrongSecret, expired]) {
      const res = await api().get('/api/auth/me').set(bearer(token));
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('returns the current user for a valid token', async () => {
    const user = await createUser();
    const res = await api().get('/api/auth/me').set(bearer(user.token));
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: user.id, email: user.email, role: 'customer' });
  });

  it('rejects a valid token whose account no longer exists', async () => {
    const user = await createUser();
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    expect((await api().get('/api/auth/me').set(bearer(user.token))).status).toBe(401);
  });
});
