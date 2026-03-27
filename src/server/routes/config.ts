import { Router } from 'express';
import type { PunchlistConfig } from '../../shared/types.js';

export function configRouter(config?: PunchlistConfig): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({
      success: true,
      data: {
        projectName: config?.projectName ?? '',
        testCases: config?.testCases ?? [],
        categories: config?.categories ?? [],
      },
    });
  });

  return router;
}
