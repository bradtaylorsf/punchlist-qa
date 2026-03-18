export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export function isRateLimitError(res: Response): boolean {
  if (res.status !== 403) return false;
  const remaining = res.headers.get('x-ratelimit-remaining');
  return remaining === '0';
}

export function getRetryAfterMs(res: Response): number {
  const resetHeader = res.headers.get('x-ratelimit-reset');
  if (resetHeader) {
    const resetTime = parseInt(resetHeader, 10) * 1000;
    const waitMs = resetTime - Date.now();
    if (waitMs > 0) return waitMs;
  }
  const retryAfter = res.headers.get('retry-after');
  if (retryAfter) {
    return parseInt(retryAfter, 10) * 1000;
  }
  return 60_000;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const maxDelayMs = options?.maxDelayMs ?? 30_000;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries || !shouldRetry(error)) {
        throw error;
      }
      const jitter = Math.random() * 0.5 + 0.75; // 0.75 - 1.25
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt) * jitter, maxDelayMs);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
