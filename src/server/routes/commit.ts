import { Router } from 'express';
import { TTLCache } from '../../adapters/issues/cache.js';
import { execSync } from 'node:child_process';

function getLatestCommitSha(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

export function commitRouter(): Router {
  const commitCache = new TTLCache<string>(30 * 1000); // 30s TTL
  const router = Router();

  router.get('/', (_req, res) => {
    let sha = commitCache.get('latest');
    if (!sha) {
      sha = getLatestCommitSha();
      commitCache.set('latest', sha);
    }
    res.json({ success: true, data: { sha } });
  });

  return router;
}
