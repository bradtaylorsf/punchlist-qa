import { Router } from 'express';
import { requireAdmin } from '../middleware/require-admin.js';
import { createGitHubTokenInputSchema } from '../../shared/schemas.js';
import { encrypt } from '../../shared/encryption.js';
import type { StorageAdapter } from '../../adapters/storage/types.js';

export function githubTokensRouter(
  storage: StorageAdapter,
  encryptionSecret: string,
): Router {
  const router = Router();

  // GET /api/github-tokens — list all registered token owners (no secrets)
  router.get('/', requireAdmin, async (_req, res, next) => {
    try {
      const tokens = await storage.listGitHubTokens();
      res.json({ success: true, data: tokens });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/github-tokens — register or update a token for an owner
  router.post('/', requireAdmin, async (req, res, next) => {
    try {
      const input = createGitHubTokenInputSchema.parse(req.body);
      const encrypted = encrypt(input.token, encryptionSecret);
      const token = await storage.createOrUpdateGitHubToken(input.owner, encrypted);
      res.status(201).json({ success: true, data: token });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/github-tokens/:owner — remove a token (idempotent)
  router.delete('/:owner', requireAdmin, async (req, res, next) => {
    try {
      await storage.deleteGitHubToken(req.params.owner as string);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
