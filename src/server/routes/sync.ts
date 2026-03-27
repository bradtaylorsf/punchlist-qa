import { Router } from 'express';
import { z } from 'zod';
import { ConfigFetcher, ConfigFetcherError } from '../../shared/config-fetcher.js';
import { requireAdmin } from '../middleware/require-admin.js';
import { categorySchema, testCaseSchema } from '../../shared/schemas.js';
import type { StorageAdapter } from '../../adapters/storage/types.js';
import type { Category, TestCase } from '../../shared/schemas.js';

interface SyncDiff<T> {
  added: T[];
  updated: T[];
  removed: T[];
}

interface SyncResult {
  categories: SyncDiff<Category>;
  testCases: SyncDiff<TestCase>;
  syncedAt: string | null;
  isFirstSync: boolean;
}

function diffById<T extends { id: string }>(
  incoming: T[],
  existing: T[],
): SyncDiff<T> {
  const existingMap = new Map(existing.map((item) => [item.id, item]));
  const incomingMap = new Map(incoming.map((item) => [item.id, item]));

  const added: T[] = [];
  const updated: T[] = [];
  const removed: T[] = [];

  for (const item of incoming) {
    const prev = existingMap.get(item.id);
    if (!prev) {
      added.push(item);
    } else if (JSON.stringify(prev) !== JSON.stringify(item)) {
      updated.push(item);
    }
  }

  for (const item of existing) {
    if (!incomingMap.has(item.id)) {
      removed.push(item);
    }
  }

  return { added, updated, removed };
}

function configKey(projectId: string, suffix: string): string {
  return `project:${projectId}:${suffix}`;
}

async function loadStoredConfig(
  storage: StorageAdapter,
  projectId: string,
): Promise<{ categories: Category[]; testCases: TestCase[] }> {
  const [catRaw, tcRaw] = await Promise.all([
    storage.getConfig(configKey(projectId, 'categories')),
    storage.getConfig(configKey(projectId, 'testCases')),
  ]);
  return {
    categories: catRaw ? z.array(categorySchema).parse(JSON.parse(catRaw)) : [],
    testCases: tcRaw ? z.array(testCaseSchema).parse(JSON.parse(tcRaw)) : [],
  };
}

export function syncRouter(
  storageAdapter: StorageAdapter,
  githubToken: string,
): Router {
  const router = Router({ mergeParams: true });

  // GET /api/projects/:projectId/sync — get current sync status
  router.get('/', requireAdmin, async (req, res, next) => {
    try {
      const projectId = req.params.projectId as string;
      const syncedAt = await storageAdapter.getConfig(configKey(projectId, 'configSyncedAt'));
      const stored = await loadStoredConfig(storageAdapter, projectId);
      res.json({
        success: true,
        data: {
          syncedAt,
          categoriesCount: stored.categories.length,
          testCasesCount: stored.testCases.length,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/projects/:projectId/sync — preview or apply sync
  router.post('/', requireAdmin, async (req, res, next) => {
    try {
      const projectId = req.params.projectId as string;
      const project = req.project!;
      const preview = req.query.preview === 'true';

      const parts = project.repoSlug.split('/');
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        res.status(400).json({
          success: false,
          error: `Invalid repo slug: "${project.repoSlug}". Expected "owner/repo".`,
        });
        return;
      }
      const [owner, repo] = parts;
      const fetcher = new ConfigFetcher({ owner, repo, token: githubToken });

      let remoteConfig;
      try {
        remoteConfig = await fetcher.fetch(true);
      } catch (err) {
        if (err instanceof ConfigFetcherError) {
          const statusMap: Record<string, number> = {
            NOT_FOUND: 404,
            ACCESS_DENIED: 403,
            RATE_LIMITED: 429,
            INVALID_CONFIG: 422,
            NETWORK_ERROR: 502,
          };
          res.status(statusMap[err.code] ?? 500).json({
            success: false,
            error: err.message,
            code: err.code,
          });
          return;
        }
        throw err;
      }

      const stored = await loadStoredConfig(storageAdapter, projectId);
      const isFirstSync = stored.categories.length === 0 && stored.testCases.length === 0;

      const result: SyncResult = {
        categories: diffById(remoteConfig.categories ?? [], stored.categories),
        testCases: diffById(remoteConfig.testCases ?? [], stored.testCases),
        syncedAt: null,
        isFirstSync,
      };

      if (!preview) {
        const now = new Date().toISOString();
        await Promise.all([
          storageAdapter.setConfig(
            configKey(projectId, 'categories'),
            JSON.stringify(remoteConfig.categories ?? []),
          ),
          storageAdapter.setConfig(
            configKey(projectId, 'testCases'),
            JSON.stringify(remoteConfig.testCases ?? []),
          ),
          storageAdapter.setConfig(configKey(projectId, 'configSyncedAt'), now),
        ]);
        result.syncedAt = now;
      }

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export { configKey, loadStoredConfig, diffById };
