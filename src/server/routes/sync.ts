import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/require-admin.js';
import { categorySchema, testCaseSchema, partialConfigSchema } from '../../shared/schemas.js';
import type { StorageAdapter } from '../../adapters/storage/types.js';
import type { Category, TestCase, PartialConfig } from '../../shared/schemas.js';

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

class SyncFetchError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'SyncFetchError';
    this.status = status;
    this.code = code;
  }
}

async function fetchPartialConfig(
  owner: string,
  repo: string,
  token: string,
): Promise<PartialConfig> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/punchlist.config.json`;

  let ghRes: Response;
  try {
    ghRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
  } catch (err) {
    throw new SyncFetchError(
      `Network error fetching config: ${err instanceof Error ? err.message : String(err)}`,
      502,
      'NETWORK_ERROR',
    );
  }

  if (ghRes.status === 404) {
    throw new SyncFetchError(
      `punchlist.config.json not found in ${owner}/${repo}`,
      404,
      'NOT_FOUND',
    );
  }
  if (ghRes.status === 429 || (ghRes.status === 403 && ghRes.headers.get('x-ratelimit-remaining') === '0')) {
    throw new SyncFetchError('GitHub API rate limit exceeded', 429, 'RATE_LIMITED');
  }
  if (ghRes.status === 403) {
    throw new SyncFetchError('GitHub API access denied — check token permissions', 403, 'ACCESS_DENIED');
  }
  if (!ghRes.ok) {
    throw new SyncFetchError(`GitHub API error: ${ghRes.status} ${ghRes.statusText}`, 502, 'NETWORK_ERROR');
  }

  let body: { content?: string };
  try {
    body = (await ghRes.json()) as { content?: string };
  } catch {
    throw new SyncFetchError('Invalid JSON response from GitHub API', 422, 'INVALID_CONFIG');
  }
  if (!body.content) {
    throw new SyncFetchError('No content in GitHub API response', 422, 'INVALID_CONFIG');
  }

  let rawConfig: unknown;
  try {
    rawConfig = JSON.parse(Buffer.from(body.content, 'base64').toString('utf-8'));
  } catch {
    throw new SyncFetchError('Failed to decode or parse config content', 422, 'INVALID_CONFIG');
  }

  const result = partialConfigSchema.safeParse(rawConfig);
  if (!result.success) {
    const errors = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new SyncFetchError(`Invalid config: ${errors}`, 422, 'INVALID_CONFIG');
  }

  return result.data;
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

      let remoteConfig: PartialConfig;
      try {
        remoteConfig = await fetchPartialConfig(owner, repo, githubToken);
      } catch (err) {
        if (err instanceof SyncFetchError) {
          res.status(err.status).json({
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
