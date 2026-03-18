import { describe, it, expect } from 'vitest';
import { ApiError, isRetriableError } from '../../src/dashboard/api/client';

describe('ApiError', () => {
  it('stores status code', () => {
    const err = new ApiError('not found', 404);
    expect(err.status).toBe(404);
    expect(err.message).toBe('not found');
    expect(err.name).toBe('ApiError');
  });

  it('is an instance of Error', () => {
    const err = new ApiError('test', 500);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
  });
});

describe('isRetriableError', () => {
  it('returns true for TypeError (network failure)', () => {
    expect(isRetriableError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('returns true for 500 ApiError', () => {
    expect(isRetriableError(new ApiError('server error', 500))).toBe(true);
  });

  it('returns true for 502 ApiError', () => {
    expect(isRetriableError(new ApiError('bad gateway', 502))).toBe(true);
  });

  it('returns true for 503 ApiError', () => {
    expect(isRetriableError(new ApiError('service unavailable', 503))).toBe(true);
  });

  it('returns false for 400 ApiError', () => {
    expect(isRetriableError(new ApiError('bad request', 400))).toBe(false);
  });

  it('returns false for 401 ApiError', () => {
    expect(isRetriableError(new ApiError('unauthorized', 401))).toBe(false);
  });

  it('returns false for 404 ApiError', () => {
    expect(isRetriableError(new ApiError('not found', 404))).toBe(false);
  });

  it('returns false for 422 ApiError', () => {
    expect(isRetriableError(new ApiError('validation error', 422))).toBe(false);
  });

  it('returns false for generic Error', () => {
    expect(isRetriableError(new Error('something'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isRetriableError('string')).toBe(false);
    expect(isRetriableError(null)).toBe(false);
    expect(isRetriableError(undefined)).toBe(false);
  });
});
