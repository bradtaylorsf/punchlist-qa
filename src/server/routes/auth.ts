import { Router } from 'express';
import passport from 'passport';
import type { StorageAdapter } from '../../adapters/storage/types.js';
import type { User } from '../../shared/types.js';
import {
  loginRequestSchema,
  passwordLoginRequestSchema,
  setupRequestSchema,
  setPasswordRequestSchema,
  changePasswordRequestSchema,
} from '../../shared/schemas.js';
import { generateToken, validateToken, hashToken, buildInviteUrl } from '../auth/invite.js';
import { hashPassword, verifyPassword } from '../../adapters/auth/password.js';
import { userRoleSchema } from '../../shared/schemas.js';
import {
  InvalidTokenError,
  UnrecognizedTokenError,
  RevokedUserError,
  SetupAlreadyCompleteError,
} from '../../adapters/auth/errors.js';

const DEFAULT_BASE_URL = 'http://localhost:4747';

export function authRouter(storage: StorageAdapter, sessionSecret: string): Router {
  const router = Router();

  /**
   * GET /api/auth/status
   * Public. Returns whether setup is required and the currently authenticated user (if any).
   */
  router.get('/status', async (req, res, next) => {
    try {
      const count = await storage.countUsers();
      const user = req.isAuthenticated() ? (req.user as User) : null;
      const userInfo = user
        ? { id: user.id, email: user.email, name: user.name, role: user.role }
        : null;
      res.json({ success: true, data: { setupRequired: count === 0, user: userInfo } });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/auth/setup
   * Public. Only works when no users exist (first-run setup).
   * Creates the first admin user with a password.
   */
  router.post('/setup', async (req, res, next) => {
    try {
      const count = await storage.countUsers();
      if (count > 0) {
        throw new SetupAlreadyCompleteError();
      }

      const body = setupRequestSchema.parse(req.body);
      const passwordHash = await hashPassword(body.password);

      // Generate a dummy token hash so the NOT NULL constraint is satisfied.
      // This user authenticates via password, not invite tokens.
      const dummyToken = generateToken(sessionSecret, body.email);
      const tokenHash = hashToken(dummyToken);

      const user = await storage.createUser({
        email: body.email,
        name: body.name,
        tokenHash,
        role: userRoleSchema.parse('admin'),
        invitedBy: 'self-setup',
        passwordHash,
      });

      await new Promise<void>((resolve, reject) => {
        req.login(user, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      const { tokenHash: _hash, ...safeUser } = user;
      res.status(201).json({ success: true, data: safeUser });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/auth/login
   * Public. Accepts either { email, password } for password login,
   * or { token } for invite/magic-link login.
   */
  router.post('/login', async (req, res, next) => {
    try {
      const body = req.body as Record<string, unknown>;

      // Token-based login (invite links)
      if (typeof body.token === 'string' && !body.email) {
        const { token } = loginRequestSchema.parse(body);

        const validation = validateToken(sessionSecret, token);
        if (!validation.valid || !validation.email) {
          throw new InvalidTokenError();
        }

        const tokenHash = hashToken(token);
        const user = await storage.getUserByTokenHash(tokenHash);
        if (!user) {
          throw new UnrecognizedTokenError();
        }
        if (user.revoked) {
          throw new RevokedUserError();
        }

        await new Promise<void>((resolve, reject) => {
          req.login(user, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });

        const { tokenHash: _hash, ...safeUser } = user;
        return res.status(200).json({ success: true, data: safeUser });
      }

      // Email/password login via Passport LocalStrategy
      const loginBody = passwordLoginRequestSchema.parse(body);
      void loginBody; // validated, passport will re-read from req.body

      return new Promise<void>((resolve) => {
        passport.authenticate(
          'local',
          (err: Error | null, user: User | false, info: { message: string } | undefined) => {
            if (err) {
              next(err);
              return resolve();
            }
            if (!user) {
              res
                .status(401)
                .json({ success: false, error: info?.message ?? 'Invalid credentials' });
              return resolve();
            }
            req.login(user, (loginErr) => {
              if (loginErr) {
                next(loginErr);
                return resolve();
              }
              const { tokenHash: _hash, ...safeUser } = user;
              res.status(200).json({ success: true, data: safeUser });
              resolve();
            });
          },
        )(req, res, next);
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/auth/logout
   * Requires auth (but graceful if already logged out).
   */
  router.post('/logout', (req, res, next) => {
    req.logout((err) => {
      if (err) {
        return next(err);
      }
      req.session.destroy((destroyErr) => {
        if (destroyErr) {
          // Non-fatal: session is gone from passport's perspective
          console.warn('[punchlist] Session destroy error:', destroyErr);
        }
        res.status(200).json({ success: true });
      });
    });
  });

  /**
   * POST /api/auth/set-password
   * Public. Validates an invite token, sets the user's password, logs them in.
   */
  router.post('/set-password', async (req, res, next) => {
    try {
      const body = setPasswordRequestSchema.parse(req.body);

      const validation = validateToken(sessionSecret, body.token);
      if (!validation.valid || !validation.email) {
        throw new InvalidTokenError();
      }

      const tokenHash = hashToken(body.token);
      const user = await storage.getUserByTokenHash(tokenHash);
      if (!user) {
        throw new UnrecognizedTokenError();
      }
      if (user.revoked) {
        throw new RevokedUserError();
      }

      const passwordHash = await hashPassword(body.password);
      await storage.updateUserPasswordHash(user.email, passwordHash);

      // Invalidate the invite token by replacing it with a fresh dummy hash
      const dummyToken = generateToken(sessionSecret, user.email);
      const newTokenHash = hashToken(dummyToken);
      await storage.updateUserTokenHash(user.email, newTokenHash);

      // Re-fetch user to get the updated state
      const updatedUser = await storage.getUserByEmail(user.email);
      if (!updatedUser) {
        throw new Error('User not found after update');
      }

      await new Promise<void>((resolve, reject) => {
        req.login(updatedUser, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      const { tokenHash: _hash, ...safeUser } = updatedUser;
      res.status(200).json({ success: true, data: safeUser });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/auth/change-password
   * Requires auth. Verifies current password, sets new password.
   */
  router.post('/change-password', async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const body = changePasswordRequestSchema.parse(req.body);
      const user = req.user as User;

      const currentHash = await storage.getUserPasswordHash(user.email);
      if (!currentHash) {
        res.status(403).json({
          success: false,
          error: 'No password set. Use your invite link to set a password.',
        });
        return;
      }

      const valid = await verifyPassword(body.currentPassword, currentHash);
      if (!valid) {
        res.status(401).json({ success: false, error: 'Current password is incorrect' });
        return;
      }

      const newHash = await hashPassword(body.newPassword);
      await storage.updateUserPasswordHash(user.email, newHash);

      res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/auth/reset-password
   * Admin only. Regenerates a login token for a user, returns the invite URL.
   */
  router.post('/reset-password', async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      if ((req.user as User).role !== 'admin') {
        res.status(403).json({ success: false, error: 'Admin access required' });
        return;
      }

      const { email } = req.body as { email?: string };
      if (!email || typeof email !== 'string') {
        res.status(400).json({ success: false, error: 'email is required' });
        return;
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      const token = generateToken(sessionSecret, email);
      const tokenHash = hashToken(token);
      await storage.updateUserTokenHash(email, tokenHash);

      const baseUrl =
        req.headers.origin ??
        `${req.protocol}://${req.get('host') ?? `localhost:4747`}`;
      const inviteUrl = buildInviteUrl(String(baseUrl), token);

      res.status(200).json({ success: true, data: { inviteUrl } });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

// Keep this export for backward compatibility during the transition.
export { DEFAULT_BASE_URL };
