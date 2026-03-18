import { Router } from 'express';
import express from 'express';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

export function dashboardRouter(): Router {
  const router = Router();

  const dashboardDir = join(import.meta.dirname, '../../../dist/dashboard');

  if (existsSync(dashboardDir)) {
    router.use(express.static(dashboardDir));

    // SPA fallback: serve index.html for unmatched routes
    router.get('{*path}', (_req, res) => {
      res.sendFile(join(dashboardDir, 'index.html'));
    });
  }

  return router;
}
