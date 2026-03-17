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
