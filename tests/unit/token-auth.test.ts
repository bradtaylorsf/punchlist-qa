import { describe, it, expect } from 'vitest';
import { TokenAuthAdapter } from '../../src/adapters/auth/token.js';

describe('TokenAuthAdapter', () => {
  const secret = 'a-very-long-secret-for-testing-purposes-minimum-16-chars';

  describe('constructor', () => {
    it('should create an adapter with a valid secret', () => {
      expect(() => new TokenAuthAdapter(secret)).not.toThrow();
    });

    it('should throw with a short secret', () => {
      expect(() => new TokenAuthAdapter('short')).toThrow('at least 16 characters');
    });

    it('should throw with an empty secret', () => {
      expect(() => new TokenAuthAdapter('')).toThrow();
    });
  });

  describe('generateToken', () => {
    it('should generate a non-empty token', () => {
      const auth = new TokenAuthAdapter(secret);
      const token = auth.generateToken('user@example.com');
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('should generate different tokens for the same email (due to nonce)', () => {
      const auth = new TokenAuthAdapter(secret);
      const token1 = auth.generateToken('user@example.com');
      const token2 = auth.generateToken('user@example.com');
      expect(token1).not.toBe(token2);
    });

    it('should generate base64url-safe tokens', () => {
      const auth = new TokenAuthAdapter(secret);
      const token = auth.generateToken('user@example.com');
      // base64url should not contain +, /, or =
      expect(token).not.toMatch(/[+/=]/);
    });
  });

  describe('validateToken', () => {
    it('should validate a token it generated', () => {
      const auth = new TokenAuthAdapter(secret);
      const token = auth.generateToken('user@example.com');
      const result = auth.validateToken(token);
      expect(result.valid).toBe(true);
      expect(result.email).toBe('user@example.com');
    });

    it('should reject a tampered token', () => {
      const auth = new TokenAuthAdapter(secret);
      const token = auth.generateToken('user@example.com');
      const tampered = token.slice(0, -2) + 'XX';
      const result = auth.validateToken(tampered);
      expect(result.valid).toBe(false);
    });

    it('should reject a token signed with a different secret', () => {
      const auth1 = new TokenAuthAdapter(secret);
      const auth2 = new TokenAuthAdapter('different-secret-also-long-enough');
      const token = auth1.generateToken('user@example.com');
      const result = auth2.validateToken(token);
      expect(result.valid).toBe(false);
    });

    it('should reject garbage input', () => {
      const auth = new TokenAuthAdapter(secret);
      expect(auth.validateToken('').valid).toBe(false);
      expect(auth.validateToken('not-a-token').valid).toBe(false);
      expect(auth.validateToken('YWJj').valid).toBe(false);
    });

    it('should handle emails with special characters', () => {
      const auth = new TokenAuthAdapter(secret);
      const token = auth.generateToken('user+tag@example.com');
      const result = auth.validateToken(token);
      expect(result.valid).toBe(true);
      expect(result.email).toBe('user+tag@example.com');
    });
  });
});
