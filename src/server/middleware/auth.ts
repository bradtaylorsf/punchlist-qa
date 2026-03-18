import type { Request, Response, NextFunction } from 'express';
import type { AuthAdapter } from '../../adapters/auth/types.js';
import type { User } from '../../shared/types.js';
import { authenticateRequest } from '../../adapters/auth/middleware.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Express middleware that validates the session cookie and sets req.user.
 * Returns 401 if no valid session is found.
 */
export function requireAuth(authAdapter: AuthAdapter) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await authenticateRequest(authAdapter, req.headers.cookie);
      if (!user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      req.user = user;
      next();
    } catch {
      res.status(401).json({ success: false, error: 'Authentication required' });
    }
  };
}
