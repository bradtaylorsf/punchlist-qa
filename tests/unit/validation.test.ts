import { describe, it, expect } from 'vitest';
import { validateConfig, validateEmail, validateRepoFormat } from '../../src/shared/validation.js';
import sampleConfig from '../fixtures/sample-config.json';

describe('validateConfig', () => {
  it('should validate a correct config', () => {
    const result = validateConfig(sampleConfig);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject null input', () => {
    const result = validateConfig(null);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should reject non-object input', () => {
    const result = validateConfig('string');
    expect(result.valid).toBe(false);
  });

  it('should require projectName', () => {
    const config = { ...sampleConfig, projectName: '' };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('projectName'))).toBe(true);
  });

  it('should reject invalid issueTracker type', () => {
    const config = { ...sampleConfig, issueTracker: { ...sampleConfig.issueTracker, type: 'invalid' } };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('issueTracker.type'))).toBe(true);
  });

  it('should reject missing issueTracker', () => {
    const { issueTracker, ...config } = sampleConfig;
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
  });

  it('should reject invalid storage type', () => {
    const config = { ...sampleConfig, storage: { ...sampleConfig.storage, type: 'postgres' } };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
  });

  it('should reject invalid auth type', () => {
    const config = { ...sampleConfig, auth: { type: 'oauth' } };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
  });

  it('should reject invalid widget position', () => {
    const config = { ...sampleConfig, widget: { ...sampleConfig.widget, position: 'center' } };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
  });

  it('should reject invalid widget theme', () => {
    const config = { ...sampleConfig, widget: { ...sampleConfig.widget, theme: 'blue' } };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
  });

  it('should reject non-array corsDomains', () => {
    const config = { ...sampleConfig, widget: { ...sampleConfig.widget, corsDomains: 'not-array' } };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
  });

  it('should reject invalid aiTool', () => {
    const config = { ...sampleConfig, aiTool: 'chatgpt' };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
  });

  it('should reject non-array testCases', () => {
    const config = { ...sampleConfig, testCases: 'not-array' };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
  });

  it('should collect multiple errors', () => {
    const result = validateConfig({ projectName: '', aiTool: 'invalid' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe('validateEmail', () => {
  it('should accept valid emails', () => {
    expect(validateEmail('user@example.com')).toBe(true);
    expect(validateEmail('test.user@domain.org')).toBe(true);
    expect(validateEmail('a@b.co')).toBe(true);
  });

  it('should reject invalid emails', () => {
    expect(validateEmail('')).toBe(false);
    expect(validateEmail('not-an-email')).toBe(false);
    expect(validateEmail('@domain.com')).toBe(false);
    expect(validateEmail('user@')).toBe(false);
    expect(validateEmail('user @domain.com')).toBe(false);
  });
});

describe('cross-field validation', () => {
  const baseConfig = {
    projectName: 'test-project',
    issueTracker: { type: 'github', repo: 'owner/repo' },
    storage: { type: 'sqlite', path: './punchlist.db' },
    auth: { type: 'token' },
    widget: { position: 'bottom-right', theme: 'light', corsDomains: ['http://localhost:3000'] },
    aiTool: 'claude-code',
    testers: [],
  };

  it('should pass with valid categories and matching test cases', () => {
    const config = {
      ...baseConfig,
      categories: [{ id: 'auth', label: 'Auth' }],
      testCases: [
        { id: 'auth-001', title: 'Login test', category: 'auth', priority: 'high', instructions: 'Login', expectedResult: 'Success' },
      ],
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(true);
  });

  it('should pass with hyphenated category names', () => {
    const config = {
      ...baseConfig,
      categories: [{ id: 'user-auth', label: 'User Auth' }],
      testCases: [
        { id: 'user-auth-001', title: 'Login test', category: 'user-auth', priority: 'high', instructions: 'Login', expectedResult: 'Success' },
      ],
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(true);
  });

  it('should pass with empty categories and empty test cases', () => {
    const config = { ...baseConfig, categories: [], testCases: [] };
    const result = validateConfig(config);
    expect(result.valid).toBe(true);
  });

  it('should reject duplicate category IDs', () => {
    const config = {
      ...baseConfig,
      categories: [
        { id: 'auth', label: 'Auth' },
        { id: 'auth', label: 'Auth Duplicate' },
      ],
      testCases: [],
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Duplicate category ID'))).toBe(true);
  });

  it('should reject duplicate test case IDs', () => {
    const config = {
      ...baseConfig,
      categories: [{ id: 'auth', label: 'Auth' }],
      testCases: [
        { id: 'auth-001', title: 'Test 1', category: 'auth', priority: 'high', instructions: 'Do X', expectedResult: 'Y' },
        { id: 'auth-001', title: 'Test 2', category: 'auth', priority: 'low', instructions: 'Do Z', expectedResult: 'W' },
      ],
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Duplicate test case ID'))).toBe(true);
  });

  it('should reject invalid category reference with suggestion', () => {
    const config = {
      ...baseConfig,
      categories: [{ id: 'auth', label: 'Auth' }, { id: 'checkout', label: 'Checkout' }],
      testCases: [
        { id: 'auht-001', title: 'Test', category: 'auht', priority: 'high', instructions: 'Do X', expectedResult: 'Y' },
      ],
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('not found') && e.includes('Did you mean'))).toBe(true);
  });

  it('should reject test ID prefix that does not match category', () => {
    const config = {
      ...baseConfig,
      categories: [{ id: 'auth', label: 'Auth' }, { id: 'checkout', label: 'Checkout' }],
      testCases: [
        { id: 'checkout-001', title: 'Test', category: 'auth', priority: 'high', instructions: 'Do X', expectedResult: 'Y' },
      ],
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('does not match category'))).toBe(true);
  });
});

describe('validateRepoFormat', () => {
  it('should accept valid repo formats', () => {
    expect(validateRepoFormat('owner/repo')).toBe(true);
    expect(validateRepoFormat('my-org/my-repo')).toBe(true);
    expect(validateRepoFormat('user123/project.name')).toBe(true);
  });

  it('should reject invalid repo formats', () => {
    expect(validateRepoFormat('')).toBe(false);
    expect(validateRepoFormat('no-slash')).toBe(false);
    expect(validateRepoFormat('too/many/slashes')).toBe(false);
    expect(validateRepoFormat('/leading-slash')).toBe(false);
    expect(validateRepoFormat('trailing-slash/')).toBe(false);
  });
});
