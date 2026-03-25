import { GitHubIssueAdapter } from './github.js';
import type { IssueAdapter } from './types.js';

/**
 * Caches per-project GitHubIssueAdapter instances by repo slug.
 * Lazily creates and initializes adapters on first access.
 */
export class IssueAdapterRegistry {
  private readonly adapters = new Map<string, IssueAdapter>();

  /**
   * Get or create an IssueAdapter for the given repo slug + token.
   * Adapters are cached by repoSlug. If the token changes (e.g., project
   * token was rotated), call `invalidate(repoSlug)` first.
   */
  getAdapter(repoSlug: string, token: string): IssueAdapter {
    const existing = this.adapters.get(repoSlug);
    if (existing) return existing;

    const adapter = new GitHubIssueAdapter(repoSlug, token);
    this.adapters.set(repoSlug, adapter);
    return adapter;
  }

  /**
   * Evict a cached adapter (e.g., when a project's token is rotated).
   */
  invalidate(repoSlug: string): void {
    this.adapters.delete(repoSlug);
  }

  /**
   * Evict all cached adapters.
   */
  clear(): void {
    this.adapters.clear();
  }
}
