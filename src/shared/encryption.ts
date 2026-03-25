import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag
const SALT_LENGTH = 16; // 128-bit salt for PBKDF2
const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 32; // 256-bit key

/**
 * Derive a 32-byte key from a secret string using PBKDF2 with a random salt.
 */
function deriveKey(secret: string, salt: Buffer): Buffer {
  return pbkdf2Sync(secret, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * Legacy key derivation for backward compatibility with existing encrypted data.
 */
function deriveKeyLegacy(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

/**
 * Encrypt plaintext using AES-256-GCM with PBKDF2 key derivation.
 * Returns a string in the format: salt:iv:authTag:ciphertext (all hex-encoded).
 */
export function encrypt(plaintext: string, secret: string): string {
  if (!plaintext) throw new Error('Cannot encrypt empty plaintext');
  if (!secret) throw new Error('Encryption secret is required');

  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(secret, salt);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a string produced by encrypt() using AES-256-GCM.
 * Throws if the secret is wrong or the ciphertext has been tampered with.
 *
 * Supports both the new 4-part format (salt:iv:authTag:ciphertext) and the
 * legacy 3-part format (iv:authTag:ciphertext) for backward compatibility.
 */
export function decrypt(encrypted: string, secret: string): string {
  if (!encrypted) throw new Error('Cannot decrypt empty ciphertext');
  if (!secret) throw new Error('Decryption secret is required');

  const parts = encrypted.split(':');

  let key: Buffer;
  let ivHex: string;
  let authTagHex: string;
  let ciphertextHex: string;

  if (parts.length === 4) {
    // New format: salt:iv:authTag:ciphertext (PBKDF2 key derivation)
    const salt = Buffer.from(parts[0], 'hex');
    key = deriveKey(secret, salt);
    ivHex = parts[1];
    authTagHex = parts[2];
    ciphertextHex = parts[3];
  } else if (parts.length === 3) {
    // Legacy format: iv:authTag:ciphertext (SHA-256 key derivation)
    key = deriveKeyLegacy(secret);
    ivHex = parts[0];
    authTagHex = parts[1];
    ciphertextHex = parts[2];
  } else {
    throw new Error('Invalid encrypted format: expected salt:iv:authTag:ciphertext');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
