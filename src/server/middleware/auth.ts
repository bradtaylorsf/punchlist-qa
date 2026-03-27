import type { RequestHandler } from 'express';
import type { User } from '../../shared/types.js';

// Tell Passport (and all of Express) that req.user is our User type.
// Passport stores the deserialized user as req.user typed as Express.User.
// By merging our User fields into Express.User, we get full type safety
// everywhere req.user is accessed — without fighting Passport's global types.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface User {
      id: string;
      email: string;
      name: string;
      tokenHash: string;
      role: string;
      invitedBy: string;
      revoked: boolean;
      createdAt: string;
    }
  }
}

// Re-export User so callers can use it from this module if needed
export type { User };

/**
 * Express middleware that checks for an authenticated Passport session.
 * Returns 401 if the request is not authenticated.
 */
export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }
  next();
};
