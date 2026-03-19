import { Router } from 'express';
import type { AuthAdapter } from '../../adapters/auth/types.js';
import { requireAdmin } from '../middleware/require-admin.js';
import { inviteUserRequestSchema, revokeUserRequestSchema } from '../../shared/schemas.js';

export function usersRouter(authAdapter?: AuthAdapter): Router {
  const router = Router();

  router.get('/me', (req, res) => {
    const { id, email, name, role } = req.user!;
    res.json({ success: true, data: { id, email, name, role } });
  });

  if (authAdapter) {
    router.get('/', requireAdmin, async (_req, res, next) => {
      try {
        const users = await authAdapter.listUsers();
        const safe = users.map(({ tokenHash: _, ...rest }) => rest);
        res.json({ success: true, data: safe });
      } catch (err) {
        next(err);
      }
    });

    router.post('/invite', requireAdmin, async (req, res, next) => {
      try {
        const body = inviteUserRequestSchema.parse(req.body);
        const result = await authAdapter.createInvite(body.email, body.name, req.user!.email, {
          role: body.role,
        });
        res.status(201).json({
          success: true,
          data: {
            user: { ...result.user, tokenHash: undefined },
            inviteUrl: result.inviteUrl,
          },
        });
      } catch (err) {
        next(err);
      }
    });

    router.post('/revoke', requireAdmin, async (req, res, next) => {
      try {
        const body = revokeUserRequestSchema.parse(req.body);
        await authAdapter.revokeAccess(body.email);
        res.json({ success: true });
      } catch (err) {
        next(err);
      }
    });
  }

  return router;
}
