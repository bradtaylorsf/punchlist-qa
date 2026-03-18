import { Router } from 'express';
import type { StorageAdapter } from '../../adapters/storage/types.js';
import { createRoundInputSchema, updateRoundInputSchema } from '../../shared/schemas.js';

const createRoundBodySchema = createRoundInputSchema.pick({ name: true, description: true });

export function roundsRouter(storageAdapter: StorageAdapter): Router {
  const router = Router();

  router.get('/', async (_req, res, next) => {
    try {
      const rounds = await storageAdapter.listRounds();
      res.json({ success: true, data: rounds });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const body = createRoundBodySchema.parse(req.body);
      const input = {
        ...body,
        createdByEmail: req.user!.email,
        createdByName: req.user!.name,
      };
      const round = await storageAdapter.createRound(input);
      res.status(201).json({ success: true, data: round });
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const input = updateRoundInputSchema.parse(req.body);
      const round = await storageAdapter.updateRound(req.params.id, input);
      res.json({ success: true, data: round });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
