import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

/**
 * Express error handler (4-arg signature).
 * - Zod validation errors → 400 with structured details
 * - Generic errors → 500 with sanitized message
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof z.ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      details: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  console.error('[punchlist] Server error:', err);

  res.status(500).json({
    success: false,
    error: message,
  });
}
