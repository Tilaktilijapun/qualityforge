import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppError, errorHandler } from '@backend/errors';

function run(err: unknown) {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  errorHandler(err, {} as any, res, vi.fn());
  return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
}

afterEach(() => vi.restoreAllMocks());

describe('errorHandler (REQ-API-1)', () => {
  it('maps AppError to its status and the standard body', () => {
    const { status, body } = run(AppError.notFound('Order'));
    expect(status).toBe(404);
    expect(body).toEqual({ error: { code: 'NOT_FOUND', message: 'Order not found', details: undefined } });
  });

  it('maps ZodError to 400 VALIDATION_ERROR with field paths', () => {
    const parsed = z.object({ email: z.string().email() }).safeParse({ email: 'nope' });
    const { status, body } = run((parsed as any).error);
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details[0].path).toBe('email');
  });

  it('maps malformed JSON bodies to 400 INVALID_JSON', () => {
    const { status, body } = run({ type: 'entity.parse.failed' });
    expect(status).toBe(400);
    expect(body.error.code).toBe('INVALID_JSON');
  });

  it('hides internals of unexpected errors behind a generic 500', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { status, body } = run(new Error('connection string postgres://secret@db leaked'));
    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('secret');
  });
});
