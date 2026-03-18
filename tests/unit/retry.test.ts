import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, isRateLimitError, getRetryAfterMs } from '../../src/adapters/issues/retry.js';

describe('retry utilities', () => {
  describe('isRateLimitError', () => {
    it('should return true for 403 with x-ratelimit-remaining: 0', () => {
      const res = {
        status: 403,
        headers: new Headers({ 'x-ratelimit-remaining': '0' }),
      } as Response;
      expect(isRateLimitError(res)).toBe(true);
    });

    it('should return false for 403 without rate limit header', () => {
      const res = {
        status: 403,
        headers: new Headers(),
      } as Response;
      expect(isRateLimitError(res)).toBe(false);
    });

    it('should return false for non-403 status', () => {
      const res = {
        status: 401,
        headers: new Headers({ 'x-ratelimit-remaining': '0' }),
      } as Response;
      expect(isRateLimitError(res)).toBe(false);
    });
  });

  describe('getRetryAfterMs', () => {
    it('should use x-ratelimit-reset header', () => {
      const futureSeconds = Math.floor(Date.now() / 1000) + 30;
      const res = {
        headers: new Headers({ 'x-ratelimit-reset': String(futureSeconds) }),
      } as Response;
      const ms = getRetryAfterMs(res);
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(30_000 + 1000); // allow 1s tolerance
    });

    it('should use retry-after header as fallback', () => {
      const res = {
        headers: new Headers({ 'retry-after': '60' }),
      } as Response;
      expect(getRetryAfterMs(res)).toBe(60_000);
    });

    it('should default to 60s when no headers present', () => {
      const res = {
        headers: new Headers(),
      } as Response;
      expect(getRetryAfterMs(res)).toBe(60_000);
    });
  });

  describe('withRetry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('ok');
      const result = await withRetry(fn, () => true);
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient failure then succeed', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValue('ok');

      const promise = withRetry(fn, () => true, { maxRetries: 3, baseDelayMs: 100 });
      // Advance timers to trigger the retry delay
      await vi.advanceTimersByTimeAsync(200);
      const result = await promise;

      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should give up after maxRetries', async () => {
      vi.useRealTimers();
      const fn = vi.fn().mockRejectedValue(new Error('persistent'));

      await expect(
        withRetry(fn, () => true, { maxRetries: 2, baseDelayMs: 10 })
      ).rejects.toThrow('persistent');
      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries

      vi.useFakeTimers();
    });

    it('should cap delay at maxDelayMs', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValue('ok');

      const promise = withRetry(fn, () => true, { maxRetries: 3, baseDelayMs: 100_000, maxDelayMs: 50 });
      // maxDelayMs is 50ms, so even with large baseDelayMs, delay is capped
      await vi.advanceTimersByTimeAsync(100);
      const result = await promise;

      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should not retry when shouldRetry returns false', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fatal'));

      await expect(
        withRetry(fn, () => false, { maxRetries: 3 })
      ).rejects.toThrow('fatal');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
