import { Router } from 'express';
import { configKey, loadStoredConfig } from './sync.js';
import type { StorageAdapter } from '../../adapters/storage/types.js';
import type { PunchlistConfig } from '../../shared/types.js';

export interface ConfigRouterDeps {
  config?: PunchlistConfig;
  storageAdapter?: StorageAdapter;
}

export function configRouter(deps: ConfigRouterDeps): Router {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res, next) => {
    try {
      // Try project-specific config from DB first
      const projectId = req.project?.id;
      if (projectId && deps.storageAdapter) {
        const syncedAt = await deps.storageAdapter.getConfig(
          configKey(projectId, 'configSyncedAt'),
        );
        if (syncedAt) {
          const stored = await loadStoredConfig(deps.storageAdapter, projectId);
          res.json({
            success: true,
            data: {
              projectName: req.project?.name ?? deps.config?.projectName ?? '',
              testCases: stored.testCases,
              categories: stored.categories,
            },
          });
          return;
        }
      }

      // Fall back to global config (local mode)
      res.json({
        success: true,
        data: {
          projectName: deps.config?.projectName ?? '',
          testCases: deps.config?.testCases ?? [],
          categories: deps.config?.categories ?? [],
        },
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
