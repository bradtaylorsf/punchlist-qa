import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  InvalidTokenError,
  UnrecognizedTokenError,
  RevokedUserError,
  InvalidCredentialsError,
  PasswordNotSetError,
  SetupAlreadyCompleteError,
} from '../../adapters/auth/errors.js';

/**
 * Express error handler (4-arg signature).
 * - Zod validation errors → 400 with structured details
 * - Auth errors → mapped to appropriate HTTP status codes
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

  if (err instanceof InvalidTokenError || err instanceof UnrecognizedTokenError || err instanceof InvalidCredentialsError) {
    res.status(401).json({ success: false, error: (err as Error).message });
    return;
  }

  if (err instanceof RevokedUserError || err instanceof PasswordNotSetError) {
    res.status(403).json({ success: false, error: (err as Error).message });
    return;
  }

  if (err instanceof SetupAlreadyCompleteError) {
    res.status(409).json({ success: false, error: (err as Error).message });
    return;
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  console.error('[punchlist] Server error:', err);

  res.status(500).json({
    success: false,
    error: message,
  });
}
