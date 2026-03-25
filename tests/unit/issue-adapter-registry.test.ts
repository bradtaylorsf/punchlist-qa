import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock GitHubIssueAdapter before importing the registry
vi.mock('../../src/adapters/issues/github.js', () => {
  const MockGitHubIssueAdapter = vi.fn().mockImplementation((repoSlug: string, token: string) => ({
    repoSlug,
    token,
    initialize: vi.fn().mockResolvedValue(undefined),
    createIssue: vi.fn(),
    createQAFailureIssue: vi.fn(),
    createSupportTicketIssue: vi.fn(),
    getOpenIssueForTest: vi.fn(),
    addLabels: vi.fn(),
    validateLabels: vi.fn(),
  }));
  return { GitHubIssueAdapter: MockGitHubIssueAdapter };
});

import { IssueAdapterRegistry } from '../../src/adapters/issues/registry.js';
import { GitHubIssueAdapter } from '../../src/adapters/issues/github.js';

const MockGitHubIssueAdapter = GitHubIssueAdapter as unknown as ReturnType<typeof vi.fn>;

describe('IssueAdapterRegistry', () => {
  let registry: IssueAdapterRegistry;

  beforeEach(() => {
    registry = new IssueAdapterRegistry();
    MockGitHubIssueAdapter.mockClear();
  });

  describe('getAdapter', () => {
    it('should return a GitHubIssueAdapter instance', () => {
      const adapter = registry.getAdapter('org/repo', 'token-abc');

      expect(adapter).toBeDefined();
      expect(MockGitHubIssueAdapter).toHaveBeenCalledTimes(1);
      expect(MockGitHubIssueAdapter).toHaveBeenCalledWith('org/repo', 'token-abc');
    });

    it('should return the same instance for the same repoSlug', () => {
      const first = registry.getAdapter('org/repo', 'token-abc');
      const second = registry.getAdapter('org/repo', 'token-abc');

      expect(first).toBe(second);
      expect(MockGitHubIssueAdapter).toHaveBeenCalledTimes(1);
    });

    it('should return the same cached instance even if token differs on second call', () => {
      const first = registry.getAdapter('org/repo', 'token-abc');
      const second = registry.getAdapter('org/repo', 'token-xyz');

      expect(first).toBe(second);
      expect(MockGitHubIssueAdapter).toHaveBeenCalledTimes(1);
    });

    it('should return different instances for different repoSlugs', () => {
      const adapterA = registry.getAdapter('org/repo-a', 'token-abc');
      const adapterB = registry.getAdapter('org/repo-b', 'token-abc');

      expect(adapterA).not.toBe(adapterB);
      expect(MockGitHubIssueAdapter).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalidate', () => {
    it('should remove the cached adapter so that the next getAdapter creates a new instance', () => {
      const first = registry.getAdapter('org/repo', 'token-abc');

      registry.invalidate('org/repo');

      const second = registry.getAdapter('org/repo', 'token-abc');

      expect(first).not.toBe(second);
      expect(MockGitHubIssueAdapter).toHaveBeenCalledTimes(2);
    });

    it('should not affect other cached adapters when invalidating one repoSlug', () => {
      const adapterA = registry.getAdapter('org/repo-a', 'token-abc');
      registry.getAdapter('org/repo-b', 'token-abc');

      registry.invalidate('org/repo-b');

      const adapterAAgain = registry.getAdapter('org/repo-a', 'token-abc');
      expect(adapterA).toBe(adapterAAgain);
    });

    it('should silently no-op when invalidating a repoSlug that was never cached', () => {
      expect(() => registry.invalidate('org/never-cached')).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should remove all cached adapters so the next getAdapter creates new instances', () => {
      const firstA = registry.getAdapter('org/repo-a', 'token-abc');
      const firstB = registry.getAdapter('org/repo-b', 'token-abc');

      registry.clear();

      const secondA = registry.getAdapter('org/repo-a', 'token-abc');
      const secondB = registry.getAdapter('org/repo-b', 'token-abc');

      expect(firstA).not.toBe(secondA);
      expect(firstB).not.toBe(secondB);
      // 2 initial + 2 after clear = 4 total constructor calls
      expect(MockGitHubIssueAdapter).toHaveBeenCalledTimes(4);
    });

    it('should silently no-op when called on an empty registry', () => {
      expect(() => registry.clear()).not.toThrow();
    });
  });
});
