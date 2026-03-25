import { describe, it, expect } from 'vitest';
import { createCipheriv, createHash, randomBytes as cryptoRandomBytes } from 'node:crypto';
import { encrypt, decrypt } from '../../src/shared/encryption.js';

const SECRET = 'test-secret-key-for-encryption-tests';

describe('encryption', () => {
  it('round-trips encrypt and decrypt', () => {
    const plaintext = 'ghp_abc123tokenvalue';
    const encrypted = encrypt(plaintext, SECRET);
    const decrypted = decrypt(encrypted, SECRET);
    expect(decrypted).toBe(plaintext);
  });

  it('produces salt:iv:authTag:ciphertext format', () => {
    const encrypted = encrypt('hello', SECRET);
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(4);
    // Salt is 16 bytes = 32 hex chars
    expect(parts[0]).toMatch(/^[0-9a-f]{32}$/);
    // IV is 12 bytes = 24 hex chars
    expect(parts[1]).toMatch(/^[0-9a-f]{24}$/);
    // Auth tag is 16 bytes = 32 hex chars
    expect(parts[2]).toMatch(/^[0-9a-f]{32}$/);
    // Ciphertext is non-empty hex
    expect(parts[3]).toMatch(/^[0-9a-f]+$/);
  });

  it('produces different ciphertext each time (random salt + IV)', () => {
    const plaintext = 'same-value';
    const a = encrypt(plaintext, SECRET);
    const b = encrypt(plaintext, SECRET);
    expect(a).not.toBe(b);
    // But both decrypt to the same value
    expect(decrypt(a, SECRET)).toBe(plaintext);
    expect(decrypt(b, SECRET)).toBe(plaintext);
  });

  it('fails to decrypt with wrong secret', () => {
    const encrypted = encrypt('secret-data', SECRET);
    expect(() => decrypt(encrypted, 'wrong-secret')).toThrow();
  });

  it('fails to decrypt tampered ciphertext', () => {
    const encrypted = encrypt('secret-data', SECRET);
    const parts = encrypted.split(':');
    // Flip a character in the ciphertext (last part)
    const last = parts[3];
    const tampered = last[0] === 'a' ? 'b' + last.slice(1) : 'a' + last.slice(1);
    const tamperedEncrypted = `${parts[0]}:${parts[1]}:${parts[2]}:${tampered}`;
    expect(() => decrypt(tamperedEncrypted, SECRET)).toThrow();
  });

  it('throws on empty plaintext', () => {
    expect(() => encrypt('', SECRET)).toThrow('Cannot encrypt empty plaintext');
  });

  it('throws on empty secret', () => {
    expect(() => encrypt('data', '')).toThrow('Encryption secret is required');
    expect(() => decrypt('aa:bb:cc:dd', '')).toThrow('Decryption secret is required');
  });

  it('throws on invalid encrypted format', () => {
    expect(() => decrypt('not-valid-format', SECRET)).toThrow('Invalid encrypted format');
    expect(() => decrypt('a:b', SECRET)).toThrow('Invalid encrypted format');
  });

  it('handles unicode plaintext', () => {
    const plaintext = 'token-with-emoji-🔑-and-日本語';
    const encrypted = encrypt(plaintext, SECRET);
    expect(decrypt(encrypted, SECRET)).toBe(plaintext);
  });

  it('decrypts legacy 3-part format (backward compat)', () => {
    // Simulate legacy format: iv:authTag:ciphertext with SHA-256 key derivation
    const key = createHash('sha256').update(SECRET).digest();
    const iv = cryptoRandomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    const encrypted = Buffer.concat([cipher.update('legacy-data', 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const legacyFormat = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;

    // Should be able to decrypt legacy format
    expect(decrypt(legacyFormat, SECRET)).toBe('legacy-data');
  });
});
