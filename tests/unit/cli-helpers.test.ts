import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
}));

vi.mock('../../src/shared/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({
    projectName: 'test',
    issueTracker: { type: 'github', repo: 'owner/repo' },
    widget: { position: 'bottom-right', theme: 'light', corsDomains: [] },
    storage: { type: 'sqlite', path: '.punchlist/punchlist.db' },
    auth: { type: 'token' },
    aiTool: 'none',
    testCases: [],
    testers: [],
    secrets: {
      githubToken: 'ghp_test',
      authSecret: 'secret123',
    },
  }),
}));

let capturedDbPath: string | undefined;

vi.mock('../../src/adapters/storage/sqlite-adapter.js', () => ({
  SqliteAdapter: vi.fn().mockImplementation(({ dbPath }: { dbPath: string }) => {
    capturedDbPath = dbPath;
    return {
      initialize: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

vi.mock('../../src/adapters/auth/token.js', () => ({
  TokenAuthAdapter: vi.fn().mockImplementation(() => ({})),
}));

describe('initAdapters', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    capturedDbPath = undefined;
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it('uses config storage path when PUNCHLIST_DATA_DIR is not set', async () => {
    delete process.env.PUNCHLIST_DATA_DIR;
    const { initAdapters } = await import('../../src/cli/helpers.js');
    await initAdapters('/fake/project');

    expect(capturedDbPath).toBe(join('/fake/project', '.punchlist/punchlist.db'));
  });

  it('uses PUNCHLIST_DATA_DIR when set', async () => {
    process.env.PUNCHLIST_DATA_DIR = '/data/.punchlist';
    const { initAdapters } = await import('../../src/cli/helpers.js');
    await initAdapters('/fake/project');

    expect(capturedDbPath).toBe(join('/data/.punchlist', 'punchlist.db'));
  });
});
