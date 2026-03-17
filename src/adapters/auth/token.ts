import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AuthAdapter, TokenValidation } from './types.js';

export class TokenAuthAdapter implements AuthAdapter {
  private secret: string;

  constructor(secret: string) {
    if (!secret || secret.length < 16) {
      throw new Error('Auth secret must be at least 16 characters');
    }
    this.secret = secret;
  }

  generateToken(email: string): string {
    const nonce = randomBytes(16).toString('hex');
    const payload = `${email}:${nonce}`;
    const signature = this.sign(payload);
    return Buffer.from(`${payload}:${signature}`).toString('base64url');
  }

  validateToken(token: string): TokenValidation {
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf-8');
      const parts = decoded.split(':');
      if (parts.length < 3) {
        return { valid: false };
      }
      const signature = parts.pop()!;
      const payload = parts.join(':');
      const expectedSig = this.sign(payload);

      const sigBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSig, 'hex');

      if (sigBuffer.length !== expectedBuffer.length) {
        return { valid: false };
      }

      if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
        return { valid: false };
      }

      // Token format after pop(): [email_parts..., nonce]
      // Nonce is hex (no colons), so slice(0, -1) reliably strips it.
      // Emails with colons (rare but RFC-valid) are rejoined correctly.
      const email = parts.slice(0, -1).join(':');
      return { valid: true, email };
    } catch {
      return { valid: false };
    }
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('hex');
  }
}
