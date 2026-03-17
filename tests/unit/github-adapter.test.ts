import { describe, it, expect } from 'vitest';
import { GitHubIssueAdapter } from '../../src/adapters/issues/github.js';

describe('GitHubIssueAdapter', () => {
  describe('constructor', () => {
    it('should accept a valid owner/repo format', () => {
      expect(() => new GitHubIssueAdapter('owner/repo', 'token')).not.toThrow();
    });

    it('should reject invalid repo format', () => {
      expect(() => new GitHubIssueAdapter('invalid', 'token')).toThrow('Invalid repo format');
    });

    it('should reject empty repo', () => {
      expect(() => new GitHubIssueAdapter('', 'token')).toThrow();
    });

    it('should reject repo with only slash', () => {
      expect(() => new GitHubIssueAdapter('/', 'token')).toThrow();
    });
  });
});
