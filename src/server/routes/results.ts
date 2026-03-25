import { Router } from 'express';
import type { StorageAdapter } from '../../adapters/storage/types.js';
import { submitResultInputSchema, updateResultIssueSchema } from '../../shared/schemas.js';

const submitResultBodySchema = submitResultInputSchema.omit({
  testerName: true,
  testerEmail: true,
});

export function resultsRouter(storageAdapter: StorageAdapter): Router {
  const router = Router();

  router.get('/:roundId/results', async (req, res, next) => {
    try {
      const results = await storageAdapter.listResults(req.params.roundId, req.project?.id);
      res.json({ success: true, data: results });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:roundId/results', async (req, res, next) => {
    try {
      const body = submitResultBodySchema.parse(req.body);
      const input = {
        ...body,
        testerName: req.user!.name,
        testerEmail: req.user!.email,
      };
      const result = await storageAdapter.submitResult(req.params.roundId, input, req.project?.id);
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

  router.patch('/:roundId/results/:resultId/issue', async (req, res, next) => {
    try {
      const body = updateResultIssueSchema.parse(req.body);
      const result = await storageAdapter.updateResultIssue(req.params.resultId, body.issueUrl, body.issueNumber);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
