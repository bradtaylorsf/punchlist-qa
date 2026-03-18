import { Router } from 'express';
import type { IssueAdapter } from '../../adapters/issues/types.js';
import { createQAFailureOptsSchema } from '../../shared/schemas.js';

export function issuesRouter(issueAdapter: IssueAdapter): Router {
  const router = Router();

  router.post('/', async (req, res, next) => {
    try {
      const opts = createQAFailureOptsSchema.parse(req.body);
      const issue = await issueAdapter.createQAFailureIssue(opts);
      res.status(201).json({ success: true, data: issue });
    } catch (err) {
      next(err);
    }
  });

  router.get('/open/:testId', async (req, res, next) => {
    try {
      const issue = await issueAdapter.getOpenIssueForTest(req.params.testId);
      res.json({ success: true, data: issue });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
