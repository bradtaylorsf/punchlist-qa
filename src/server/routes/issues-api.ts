import { Router } from 'express';
import type { IssueAdapter } from '../../adapters/issues/types.js';
import type { IssueAdapterRegistry } from '../../adapters/issues/registry.js';
import type { StorageAdapter } from '../../adapters/storage/types.js';
import { createQAFailureOptsSchema } from '../../shared/schemas.js';

export interface IssuesRouterDeps {
  /** Fallback adapter for CLI / single-project mode */
  issueAdapter: IssueAdapter;
  /** Registry for resolving per-project adapters in hosted mode */
  issueAdapterRegistry?: IssueAdapterRegistry;
  /** Storage adapter for token resolution */
  storageAdapter?: StorageAdapter;
  /** Encryption secret for decrypting per-org GitHub tokens */
  encryptionSecret?: string;
}

export function issuesRouter(deps: IssuesRouterDeps): Router {
  const router = Router({ mergeParams: true });

  router.post('/', async (req, res, next) => {
    try {
      const opts = createQAFailureOptsSchema.parse(req.body);

      // Resolve project-specific adapter when project context is available
      let adapter = deps.issueAdapter;
      if (req.project && deps.issueAdapterRegistry && deps.storageAdapter && deps.encryptionSecret) {
        adapter = await deps.issueAdapterRegistry.getAdapter(
          req.project.repoSlug,
          deps.storageAdapter,
          deps.encryptionSecret,
        );
      }

      const issue = await adapter.createQAFailureIssue(opts);
      res.status(201).json({ success: true, data: issue });
    } catch (err) {
      next(err);
    }
  });

  router.get('/open/:testId', async (req, res, next) => {
    try {
      // Resolve project-specific adapter when project context is available
      let adapter = deps.issueAdapter;
      if (req.project && deps.issueAdapterRegistry && deps.storageAdapter && deps.encryptionSecret) {
        adapter = await deps.issueAdapterRegistry.getAdapter(
          req.project.repoSlug,
          deps.storageAdapter,
          deps.encryptionSecret,
        );
      }

      const issue = await adapter.getOpenIssueForTest(req.params.testId);
      res.json({ success: true, data: issue });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
