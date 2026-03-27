import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export interface TokenValidation {
  valid: boolean;
  email?: string;
}

export interface InviteResult {
  token: string;
  tokenHash: string;
  inviteUrl: string;
}

/**
 * Sign a payload string with HMAC-SHA256 using the provided secret.
 */
function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Hash a token with SHA-256 for safe storage.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a signed invite/password-reset token for the given email.
 * The token encodes the email address and a random nonce, signed with HMAC-SHA256.
 */
export function generateToken(secret: string, email: string): string {
  const nonce = randomBytes(16).toString('hex');
  const payload = `${email}:${nonce}`;
  const signature = sign(secret, payload);
  return Buffer.from(`${payload}:${signature}`).toString('base64url');
}

/**
 * Validate a signed token. Returns { valid: true, email } on success,
 * or { valid: false } if the token is malformed or the signature does not match.
 */
export function validateToken(secret: string, token: string): TokenValidation {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const parts = decoded.split(':');
    if (parts.length < 3) {
      return { valid: false };
    }
    const signature = parts.pop()!;
    const payload = parts.join(':');
    const expectedSig = sign(secret, payload);

    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSig, 'hex');

    if (sigBuffer.length !== expectedBuffer.length) {
      return { valid: false };
    }

    if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { valid: false };
    }

    // email is everything before the last colon (the nonce)
    const email = parts.slice(0, -1).join(':');
    return { valid: true, email };
  } catch {
    return { valid: false };
  }
}

/**
 * Build an invite URL from a base URL and token.
 */
export function buildInviteUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/join?token=${encodeURIComponent(token)}`;
}
