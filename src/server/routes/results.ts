import { Router } from 'express';
import type { StorageAdapter } from '../../adapters/storage/types.js';
import { submitResultInputSchema } from '../../shared/schemas.js';

export function resultsRouter(storageAdapter: StorageAdapter): Router {
  const router = Router();

  router.get('/:roundId/results', async (req, res, next) => {
    try {
      const results = await storageAdapter.listResults(req.params.roundId);
      res.json({ success: true, data: results });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:roundId/results', async (req, res, next) => {
    try {
      const body = submitResultInputSchema.parse(req.body);
      const input = {
        ...body,
        testerName: req.user!.name,
        testerEmail: req.user!.email,
      };
      const result = await storageAdapter.submitResult(req.params.roundId, input);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:roundId/results/:testId', async (req, res, next) => {
    try {
      const count = await storageAdapter.deleteResultsByTestIds(req.params.roundId, [
        req.params.testId,
      ]);
      res.json({ success: true, deleted: count });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
