import { Router } from 'express';
import type { StorageAdapter } from '../../adapters/storage/types.js';
import type { AuthAdapter } from '../../adapters/auth/types.js';
import { createAccessRequestInputSchema } from '../../shared/schemas.js';
import { requireAdmin } from '../middleware/require-admin.js';

/**
 * Public router: POST / to submit an access request (no auth required).
 */
export function publicAccessRequestRouter(storageAdapter: StorageAdapter): Router {
  const router = Router();

  router.post('/', async (req, res, next) => {
    try {
      const body = createAccessRequestInputSchema.parse(req.body);

      // Check if user already exists
      const existingUser = await storageAdapter.getUserByEmail(body.email);
      if (existingUser) {
        res.status(409).json({ success: false, error: 'An account with this email already exists' });
        return;
      }

      // Check for existing pending request
      const existingRequest = await storageAdapter.getAccessRequestByEmail(body.email);
      if (existingRequest && existingRequest.status === 'pending') {
        res.status(409).json({ success: false, error: 'A request for this email is already pending' });
        return;
      }

      // If previously rejected/approved, delete old record first (UNIQUE constraint on email)
      if (existingRequest) {
        await storageAdapter.updateAccessRequestStatus(existingRequest.id, 'rejected', 'system');
        // Delete the old record so we can insert fresh
        // Since we don't have a delete method, we update + rely on UNIQUE constraint
        // Actually we need to work around the UNIQUE constraint — update the existing record instead
        const updated = await storageAdapter.updateAccessRequestStatus(
          existingRequest.id,
          'pending',
          'system',
        );
        res.status(201).json({ success: true, data: updated });
        return;
      }

      const request = await storageAdapter.createAccessRequest(body);
      res.status(201).json({ success: true, data: request });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/**
 * Admin router: list, approve, reject access requests (requires auth + admin).
 */
export function adminAccessRequestRouter(
  storageAdapter: StorageAdapter,
  authAdapter: AuthAdapter,
): Router {
  const router = Router();

  // List all access requests
  router.get('/', requireAdmin, async (req, res, next) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const requests = await storageAdapter.listAccessRequests(status);
      res.json({ success: true, data: requests });
    } catch (err) {
      next(err);
    }
  });

  // Approve request (creates user invite)
  router.post('/:id/approve', requireAdmin, async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const request = await storageAdapter.getAccessRequest(id);
      if (!request) {
        res.status(404).json({ success: false, error: 'Access request not found' });
        return;
      }
      if (request.status !== 'pending') {
        res.status(400).json({ success: false, error: `Request already ${request.status}` });
        return;
      }

      // Create the user invite
      const inviteResult = await authAdapter.createInvite(request.email, request.name, req.user!.email);

      // Mark request as approved
      const updated = await storageAdapter.updateAccessRequestStatus(
        request.id,
        'approved',
        req.user!.email,
      );

      const { tokenHash: _hash, ...safeUser } = inviteResult.user;
      res.json({
        success: true,
        data: {
          request: updated,
          user: safeUser,
          inviteUrl: inviteResult.inviteUrl,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // Reject request
  router.post('/:id/reject', requireAdmin, async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const request = await storageAdapter.getAccessRequest(id);
      if (!request) {
        res.status(404).json({ success: false, error: 'Access request not found' });
        return;
      }
      if (request.status !== 'pending') {
        res.status(400).json({ success: false, error: `Request already ${request.status}` });
        return;
      }

      const updated = await storageAdapter.updateAccessRequestStatus(
        request.id,
        'rejected',
        req.user!.email,
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
