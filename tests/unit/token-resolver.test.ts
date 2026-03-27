import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveTokenForRepo } from '../../src/shared/token-resolver.js';
import { encrypt } from '../../src/shared/encryption.js';

const ENCRYPTION_SECRET = 'test-secret-for-encryption-1234';

function createMockStorage(encryptedToken: string | null = null) {
  return {
    getGitHubTokenEncrypted: vi.fn().mockResolvedValue(encryptedToken),
  } as unknown as Parameters<typeof resolveTokenForRepo>[1];
}

describe('resolveTokenForRepo', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.PUNCHLIST_GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    process.env.PUNCHLIST_GITHUB_TOKEN = originalEnv.PUNCHLIST_GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = originalEnv.GITHUB_TOKEN;
  });

  it('returns decrypted per-org token when found in registry', async () => {
    const plainToken = 'ghp_org_token_abc123';
    const encrypted = encrypt(plainToken, ENCRYPTION_SECRET);
    const storage = createMockStorage(encrypted);

    const result = await resolveTokenForRepo('the-answerai/answer-engine', storage, ENCRYPTION_SECRET);

    expect(result).toBe(plainToken);
    expect(storage.getGitHubTokenEncrypted).toHaveBeenCalledWith('the-answerai');
  });

  it('falls back to PUNCHLIST_GITHUB_TOKEN when no org token exists', async () => {
    process.env.PUNCHLIST_GITHUB_TOKEN = 'ghp_env_token_fallback';
    const storage = createMockStorage(null);

    const result = await resolveTokenForRepo('org/repo', storage, ENCRYPTION_SECRET);

    expect(result).toBe('ghp_env_token_fallback');
  });

  it('falls back to GITHUB_TOKEN when no org token and no PUNCHLIST_GITHUB_TOKEN', async () => {
    process.env.GITHUB_TOKEN = 'ghp_github_token_fallback';
    const storage = createMockStorage(null);

    const result = await resolveTokenForRepo('org/repo', storage, ENCRYPTION_SECRET);

    expect(result).toBe('ghp_github_token_fallback');
  });

  it('throws descriptive error when neither org token nor env token is available', async () => {
    const storage = createMockStorage(null);

    await expect(
      resolveTokenForRepo('the-answerai/answer-engine', storage, ENCRYPTION_SECRET),
    ).rejects.toThrow('No GitHub token configured for "the-answerai"');
  });

  it('throws for invalid repo slug without a slash', async () => {
    const storage = createMockStorage(null);

    await expect(
      resolveTokenForRepo('invalid-slug', storage, ENCRYPTION_SECRET),
    ).rejects.toThrow('Invalid repo slug');
  });

  it('prefers per-org token over env token', async () => {
    process.env.PUNCHLIST_GITHUB_TOKEN = 'ghp_env_token';
    const orgToken = 'ghp_org_specific_token';
    const encrypted = encrypt(orgToken, ENCRYPTION_SECRET);
    const storage = createMockStorage(encrypted);

    const result = await resolveTokenForRepo('myorg/myrepo', storage, ENCRYPTION_SECRET);

    expect(result).toBe(orgToken);
  });
});
