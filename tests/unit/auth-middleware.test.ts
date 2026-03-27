/**
 * Tests for the invite token utilities that replaced the old auth middleware.
 * The old parseCookie/buildSetCookie/handleLogin/handleLogout/authenticateRequest
 * functions have been removed. Session management is now handled by Passport.js +
 * express-session. This file tests the new invite token functions.
 */
import { describe, it, expect } from 'vitest';
import {
  generateToken,
  validateToken,
  hashToken,
  buildInviteUrl,
} from '../../src/server/auth/invite.js';

const secret = 'a-very-long-secret-for-testing-purposes-minimum-16-chars';

describe('generateToken / validateToken', () => {
  it('generates a valid token that validates to the correct email', () => {
    const token = generateToken(secret, 'alice@example.com');
    const result = validateToken(secret, token);
    expect(result.valid).toBe(true);
    expect(result.email).toBe('alice@example.com');
  });

  it('generates different tokens for the same email (nonce randomness)', () => {
    const t1 = generateToken(secret, 'alice@example.com');
    const t2 = generateToken(secret, 'alice@example.com');
    expect(t1).not.toBe(t2);
  });

  it('generates base64url-safe tokens (no +, /, or =)', () => {
    const token = generateToken(secret, 'alice@example.com');
    expect(token).not.toMatch(/[+/=]/);
  });

  it('rejects a tampered token', () => {
    const token = generateToken(secret, 'alice@example.com');
    const tampered = token.slice(0, -2) + 'XX';
    expect(validateToken(secret, tampered).valid).toBe(false);
  });

  it('rejects a token signed with a different secret', () => {
    const token = generateToken(secret, 'alice@example.com');
    expect(validateToken('different-secret-also-long-enough', token).valid).toBe(false);
  });

  it('rejects garbage inputs', () => {
    expect(validateToken(secret, '').valid).toBe(false);
    expect(validateToken(secret, 'not-a-token').valid).toBe(false);
    expect(validateToken(secret, 'YWJj').valid).toBe(false);
  });

  it('handles emails with special characters', () => {
    const token = generateToken(secret, 'user+tag@example.com');
    const result = validateToken(secret, token);
    expect(result.valid).toBe(true);
    expect(result.email).toBe('user+tag@example.com');
  });
});

describe('hashToken', () => {
  it('returns a 64-character hex string (SHA-256)', () => {
    const token = generateToken(secret, 'alice@example.com');
    const hash = hashToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('returns the same hash for the same token', () => {
    const token = generateToken(secret, 'alice@example.com');
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('returns different hashes for different tokens', () => {
    const t1 = generateToken(secret, 'alice@example.com');
    const t2 = generateToken(secret, 'alice@example.com');
    expect(hashToken(t1)).not.toBe(hashToken(t2));
  });
});

describe('buildInviteUrl', () => {
  it('builds an invite URL with the token as a query parameter', () => {
    const token = generateToken(secret, 'alice@example.com');
    const url = buildInviteUrl('https://app.example.com', token);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/join');
    expect(parsed.searchParams.get('token')).toBe(token);
  });
});
