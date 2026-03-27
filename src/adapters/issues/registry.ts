import { GitHubIssueAdapter } from './github.js';
import { resolveTokenForRepo } from '../../shared/token-resolver.js';
import type { IssueAdapter } from './types.js';
import type { StorageAdapter } from '../storage/types.js';

/**
 * Caches per-project GitHubIssueAdapter instances by repo slug.
 * Lazily creates and initializes adapters on first access.
 * Resolves tokens per-org from the github_tokens registry.
 */
export class IssueAdapterRegistry {
  private readonly adapters = new Map<string, IssueAdapter>();

  /**
   * Get or create an IssueAdapter for the given repo slug.
   * Token is resolved from the per-org registry, falling back to env.
   * Adapters are cached by repoSlug. If the token changes (e.g., rotated),
   * call `invalidate(repoSlug)` first.
   */
  async getAdapter(
    repoSlug: string,
    storage: StorageAdapter,
    encryptionSecret: string,
  ): Promise<IssueAdapter> {
    const existing = this.adapters.get(repoSlug);
    if (existing) return existing;

    const token = await resolveTokenForRepo(repoSlug, storage, encryptionSecret);
    const adapter = new GitHubIssueAdapter(repoSlug, token);
    this.adapters.set(repoSlug, adapter);
    return adapter;
  }

  /**
   * Get or create an IssueAdapter with an explicit token (legacy path).
   */
  getAdapterWithToken(repoSlug: string, token: string): IssueAdapter {
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
