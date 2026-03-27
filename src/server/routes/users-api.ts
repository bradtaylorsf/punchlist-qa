import { Router } from 'express';
import type { StorageAdapter } from '../../adapters/storage/types.js';
import { requireAdmin } from '../middleware/require-admin.js';
import {
  inviteUserRequestSchema,
  revokeUserRequestSchema,
  regenerateTokenRequestSchema,
  userRoleSchema,
} from '../../shared/schemas.js';
import { generateToken, hashToken, buildInviteUrl } from '../auth/invite.js';

export function usersRouter(storage: StorageAdapter, sessionSecret: string): Router {
  const router = Router();

  router.get('/me', (req, res) => {
    const user = req.user!;
    const { id, email, name, role } = user;
    res.json({ success: true, data: { id, email, name, role } });
  });

  router.get('/', requireAdmin, async (_req, res, next) => {
    try {
      const users = await storage.listUsers();
      const safe = users.map(({ tokenHash: _, ...rest }) => rest);
      res.json({ success: true, data: safe });
    } catch (err) {
      next(err);
    }
  });

  router.post('/invite', requireAdmin, async (req, res, next) => {
    try {
      const body = inviteUserRequestSchema.parse(req.body);
      const role = userRoleSchema.parse(body.role ?? 'tester');

      const token = generateToken(sessionSecret, body.email);
      const tokenHash = hashToken(token);

      const user = await storage.createUser({
        email: body.email,
        name: body.name,
        tokenHash,
        role,
        invitedBy: req.user!.email,
      });

      const baseUrl =
        req.headers.origin ??
        `${req.protocol}://${req.get('host') ?? 'localhost:4747'}`;
      const inviteUrl = buildInviteUrl(String(baseUrl), token);

      const { tokenHash: _hash, ...safeUser } = user;
      res.status(201).json({
        success: true,
        data: {
          user: safeUser,
          inviteUrl,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/revoke', requireAdmin, async (req, res, next) => {
    try {
      const body = revokeUserRequestSchema.parse(req.body);
      await storage.revokeUser(body.email);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/regenerate', requireAdmin, async (req, res, next) => {
    try {
      const body = regenerateTokenRequestSchema.parse(req.body);

      const user = await storage.getUserByEmail(body.email);
      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      const token = generateToken(sessionSecret, body.email);
      const tokenHash = hashToken(token);
      await storage.updateUserTokenHash(body.email, tokenHash);

      const baseUrl =
        req.headers.origin ??
        `${req.protocol}://${req.get('host') ?? 'localhost:4747'}`;
      const inviteUrl = buildInviteUrl(String(baseUrl), token);

      // Refetch user with updated hash
      const updated = await storage.getUserByEmail(body.email);
      const { tokenHash: _hash, ...safeUser } = updated!;
      res.json({
        success: true,
        data: { user: safeUser, inviteUrl },
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
