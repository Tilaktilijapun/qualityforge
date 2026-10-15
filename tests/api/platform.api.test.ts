import { describe, expect, it } from 'vitest';
import { api } from '../helpers/app';

describe('health and error conventions (REQ-API-1)', () => {
  it('GET /health reports liveness', async () => {
    const res = await api().get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /ready reports readiness without leaking connection details', async () => {
    const res = await api().get('/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready' });
  });

  it('returns the standard JSON error body for unknown routes', async () => {
    const res = await api().get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('never exposes stack traces or framework details', async () => {
    const res = await api().post('/api/auth/login').set('Content-Type', 'application/json').send('{bad');
    expect(JSON.stringify(res.body)).not.toMatch(/stack|node_modules|SyntaxError/i);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('rejects oversized request bodies with 413', async () => {
    const res = await api().post('/api/auth/register').send({ email: 'a@qualityforge.test', password: 'x'.repeat(200_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
