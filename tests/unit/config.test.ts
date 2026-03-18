import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, writeConfig } from '../../src/shared/config.js';
import type { PunchlistConfig } from '../../src/shared/types.js';

describe('config', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'punchlist-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    // Clean up env vars set during tests
    delete process.env.PUNCHLIST_GITHUB_TOKEN;
    delete process.env.PUNCHLIST_AUTH_SECRET;
  });

  const sampleConfig: PunchlistConfig = {
    projectName: 'test-project',
    issueTracker: { type: 'github', repo: 'owner/repo' },
    storage: { type: 'sqlite', path: './punchlist.db' },
    auth: { type: 'token' },
    widget: {
      position: 'bottom-right',
      theme: 'light',
      corsDomains: ['http://localhost:3000'],
      categories: [],
    },
    aiTool: 'claude-code',
    categories: [],
    testCases: [],
    testers: [],
  };

  describe('writeConfig', () => {
    it('should write config to the specified directory', () => {
      writeConfig(sampleConfig, tempDir);
      const configPath = join(tempDir, 'punchlist.config.json');
      const raw = readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.projectName).toBe('test-project');
    });

    it('should format JSON with 2-space indentation', () => {
      writeConfig(sampleConfig, tempDir);
      const configPath = join(tempDir, 'punchlist.config.json');
      const raw = readFileSync(configPath, 'utf-8');
      expect(raw).toContain('  "projectName"');
    });

    it('should end file with newline', () => {
      writeConfig(sampleConfig, tempDir);
      const configPath = join(tempDir, 'punchlist.config.json');
      const raw = readFileSync(configPath, 'utf-8');
      expect(raw.endsWith('\n')).toBe(true);
    });

    it('should not contain secret values', () => {
      writeConfig(sampleConfig, tempDir);
      const configPath = join(tempDir, 'punchlist.config.json');
      const raw = readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      // Config should not have secret/token value fields
      expect(parsed.issueTracker).not.toHaveProperty('token');
      expect(parsed.auth).not.toHaveProperty('secret');
    });
  });

  describe('loadConfig', () => {
    it('should load and parse config from directory', () => {
      writeConfig(sampleConfig, tempDir);
      const loaded = loadConfig(tempDir);
      expect(loaded.projectName).toBe('test-project');
      expect(loaded.issueTracker.type).toBe('github');
      expect(loaded.testers).toEqual([]);
    });

    it('should throw when config file does not exist', () => {
      expect(() => loadConfig(tempDir)).toThrow();
    });

    it('should throw a clear error for malformed JSON', () => {
      writeFileSync(join(tempDir, 'punchlist.config.json'), '{ invalid json }', 'utf-8');
      expect(() => loadConfig(tempDir)).toThrow(/Failed to parse punchlist\.config\.json/);
    });

    it('should preserve all config fields through write/load cycle', () => {
      writeConfig(sampleConfig, tempDir);
      const loaded = loadConfig(tempDir);
      const { secrets: _, ...config } = loaded;
      expect(config).toEqual(sampleConfig);
    });

    it('should resolve secrets from .env file', () => {
      writeConfig(sampleConfig, tempDir);
      writeFileSync(
        join(tempDir, '.env'),
        'PUNCHLIST_GITHUB_TOKEN=ghp_test123\nPUNCHLIST_AUTH_SECRET=a-long-secret-for-testing\n',
        'utf-8',
      );
      const loaded = loadConfig(tempDir);
      expect(loaded.secrets.githubToken).toBe('ghp_test123');
      expect(loaded.secrets.authSecret).toBe('a-long-secret-for-testing');
    });

    it('should return empty secrets when no .env exists', () => {
      writeConfig(sampleConfig, tempDir);
      const loaded = loadConfig(tempDir);
      expect(loaded.secrets.githubToken).toBe('');
      expect(loaded.secrets.authSecret).toBe('');
    });
  });
});
