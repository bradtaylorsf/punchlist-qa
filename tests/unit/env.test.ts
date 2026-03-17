import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readEnvFile, loadEnv, resolveSecrets, writeEnvFile } from '../../src/shared/env.js';

describe('env', () => {
  let tempDir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'punchlist-env-test-'));
    // Save env vars we might modify
    savedEnv.PUNCHLIST_GITHUB_TOKEN = process.env.PUNCHLIST_GITHUB_TOKEN;
    savedEnv.PUNCHLIST_AUTH_SECRET = process.env.PUNCHLIST_AUTH_SECRET;
    savedEnv.GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    // Clear them
    delete process.env.PUNCHLIST_GITHUB_TOKEN;
    delete process.env.PUNCHLIST_AUTH_SECRET;
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    // Restore env vars
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe('readEnvFile', () => {
    it('should parse key-value pairs from .env file', () => {
      writeFileSync(join(tempDir, '.env'), 'KEY=value\n', 'utf-8');
      const result = readEnvFile(tempDir);
      expect(result.KEY).toBe('value');
    });

    it('should handle quoted values', () => {
      writeFileSync(join(tempDir, '.env'), 'KEY="my value"\n', 'utf-8');
      const result = readEnvFile(tempDir);
      expect(result.KEY).toBe('my value');
    });

    it('should skip comments and blank lines', () => {
      writeFileSync(join(tempDir, '.env'), '# comment\n\nKEY=val\n', 'utf-8');
      const result = readEnvFile(tempDir);
      expect(result.KEY).toBe('val');
      expect(Object.keys(result)).toHaveLength(1);
    });

    it('should return empty object when .env does not exist', () => {
      const result = readEnvFile(tempDir);
      expect(result).toEqual({});
    });
  });

  describe('loadEnv', () => {
    it('should load variables from .env file into process.env', () => {
      writeFileSync(join(tempDir, '.env'), 'PUNCHLIST_GITHUB_TOKEN=abc123\n', 'utf-8');
      loadEnv(tempDir);
      expect(process.env.PUNCHLIST_GITHUB_TOKEN).toBe('abc123');
    });

    it('should not override existing env vars', () => {
      process.env.PUNCHLIST_GITHUB_TOKEN = 'existing';
      writeFileSync(join(tempDir, '.env'), 'PUNCHLIST_GITHUB_TOKEN=fromfile\n', 'utf-8');
      loadEnv(tempDir);
      expect(process.env.PUNCHLIST_GITHUB_TOKEN).toBe('existing');
    });

    it('should not throw when .env does not exist', () => {
      expect(() => loadEnv(tempDir)).not.toThrow();
    });
  });

  describe('resolveSecrets', () => {
    it('should return empty strings when no env vars or file', () => {
      const secrets = resolveSecrets(tempDir);
      expect(secrets.githubToken).toBe('');
      expect(secrets.authSecret).toBe('');
    });

    it('should read secrets from .env file without mutating process.env', () => {
      writeFileSync(join(tempDir, '.env'), 'PUNCHLIST_GITHUB_TOKEN=from_file\nPUNCHLIST_AUTH_SECRET=secret_from_file\n', 'utf-8');
      const secrets = resolveSecrets(tempDir);
      expect(secrets.githubToken).toBe('from_file');
      expect(secrets.authSecret).toBe('secret_from_file');
      // Verify process.env was NOT mutated
      expect(process.env.PUNCHLIST_GITHUB_TOKEN).toBeUndefined();
      expect(process.env.PUNCHLIST_AUTH_SECRET).toBeUndefined();
    });

    it('should prefer process.env over file values', () => {
      process.env.PUNCHLIST_GITHUB_TOKEN = 'from_env';
      writeFileSync(join(tempDir, '.env'), 'PUNCHLIST_GITHUB_TOKEN=from_file\n', 'utf-8');
      const secrets = resolveSecrets(tempDir);
      expect(secrets.githubToken).toBe('from_env');
    });

    it('should prefer PUNCHLIST_GITHUB_TOKEN over GITHUB_TOKEN', () => {
      process.env.GITHUB_TOKEN = 'fallback';
      process.env.PUNCHLIST_GITHUB_TOKEN = 'preferred';
      const secrets = resolveSecrets(tempDir);
      expect(secrets.githubToken).toBe('preferred');
    });

    it('should fall back to GITHUB_TOKEN', () => {
      process.env.GITHUB_TOKEN = 'fallback';
      const secrets = resolveSecrets(tempDir);
      expect(secrets.githubToken).toBe('fallback');
    });

    it('should fall back to GITHUB_TOKEN from file', () => {
      writeFileSync(join(tempDir, '.env'), 'GITHUB_TOKEN=file_fallback\n', 'utf-8');
      const secrets = resolveSecrets(tempDir);
      expect(secrets.githubToken).toBe('file_fallback');
    });
  });

  describe('writeEnvFile', () => {
    it('should create a new .env file with header', () => {
      writeEnvFile({ MY_KEY: 'my_value' }, tempDir);
      const content = readFileSync(join(tempDir, '.env'), 'utf-8');
      expect(content).toContain('MY_KEY=my_value');
      expect(content).toContain('do NOT commit');
    });

    it('should append to existing .env without duplicating keys', () => {
      writeFileSync(join(tempDir, '.env'), 'EXISTING_KEY=val\n', 'utf-8');
      writeEnvFile({ EXISTING_KEY: 'new_val', NEW_KEY: 'new' }, tempDir);
      const content = readFileSync(join(tempDir, '.env'), 'utf-8');
      expect(content).toContain('NEW_KEY=new');
      // Should not duplicate EXISTING_KEY
      const matches = content.match(/EXISTING_KEY/g);
      expect(matches).toHaveLength(1);
    });

    it('should not modify file when all keys exist', () => {
      writeFileSync(join(tempDir, '.env'), 'KEY=val\n', 'utf-8');
      writeEnvFile({ KEY: 'different' }, tempDir);
      const content = readFileSync(join(tempDir, '.env'), 'utf-8');
      expect(content).toBe('KEY=val\n');
    });
  });
});
