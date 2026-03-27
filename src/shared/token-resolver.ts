import { decrypt } from './encryption.js';
import type { StorageAdapter } from '../adapters/storage/types.js';

/**
 * Resolve the GitHub token for a given repo slug.
 *
 * Resolution order:
 * 1. Per-org token from the github_tokens registry (decrypted)
 * 2. Global PUNCHLIST_GITHUB_TOKEN environment variable
 *
 * Throws a descriptive error if neither is available.
 */
export async function resolveTokenForRepo(
  repoSlug: string,
  storage: StorageAdapter,
  encryptionSecret: string,
): Promise<string> {
  const parts = repoSlug.split('/');
  if (parts.length < 2 || !parts[0]) {
    throw new Error(`Invalid repo slug: "${repoSlug}". Expected "owner/repo".`);
  }
  const owner = parts[0];

  // 1. Check per-org token registry
  const encrypted = await storage.getGitHubTokenEncrypted(owner);
  if (encrypted) {
    return decrypt(encrypted, encryptionSecret);
  }

  // 2. Fall back to global env token
  const envToken = process.env.PUNCHLIST_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  if (envToken) {
    return envToken;
  }

  throw new Error(
    `No GitHub token configured for "${owner}". ` +
      `Register one via the dashboard or set PUNCHLIST_GITHUB_TOKEN in the environment.`,
  );
}
