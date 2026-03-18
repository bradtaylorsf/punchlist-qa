import { describe, it, expect } from 'vitest';
import { sessionSchema } from '../../src/shared/schemas.js';

describe('sessionSchema', () => {
  it('validates a valid session', () => {
    const result = sessionSchema.safeParse({
      id: 'abc123',
      userEmail: 'user@example.com',
      expiresAt: '2026-03-24T00:00:00.000Z',
      createdAt: '2026-03-17T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing fields', () => {
    const result = sessionSchema.safeParse({
      id: 'abc123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = sessionSchema.safeParse({
      id: 'abc123',
      userEmail: 'not-an-email',
      expiresAt: '2026-03-24T00:00:00.000Z',
      createdAt: '2026-03-17T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty object', () => {
    const result = sessionSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
