import type { Request, Response, NextFunction } from 'express';

/**
 * Custom CORS middleware — no external dependencies.
 * Checks the `Origin` header against `allowedOrigins`.
 * If the origin matches, sets appropriate CORS headers.
 * Returns 204 for preflight OPTIONS requests.
 * Rejects unmatched origins by not setting any CORS headers (browser blocks).
 */
export function corsMiddleware(allowedOrigins: string[]) {
  const originSet = new Set(allowedOrigins);

  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;

    if (!origin || !originSet.has(origin)) {
      // No origin header or origin not allowed — skip CORS headers.
      // For non-preflight requests, let them through (same-origin or server-to-server).
      // For preflight, the browser will block due to missing headers.
      if (req.method === 'OPTIONS') {
        res.status(403).end();
        return;
      }
      next();
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}
