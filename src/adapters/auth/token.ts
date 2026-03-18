import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AuthAdapter, TokenValidation, InviteResult } from './types.js';
import type { StorageAdapter } from '../storage/types.js';
import type { User } from '../../shared/types.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface TokenAuthAdapterOptions {
  secret: string;
  storage: StorageAdapter;
  baseUrl?: string;
  sessionTtlMs?: number;
}

export class TokenAuthAdapter implements AuthAdapter {
  private readonly secret: string;
  private readonly storage: StorageAdapter;
  private readonly baseUrl: string;
  private readonly sessionTtlMs: number;

  constructor(options: TokenAuthAdapterOptions) {
    if (!options.secret || options.secret.length < 16) {
      throw new Error('Auth secret must be at least 16 characters');
    }
    this.secret = options.secret;
    this.storage = options.storage;
    this.baseUrl = options.baseUrl ?? 'http://localhost:4747';
    this.sessionTtlMs = options.sessionTtlMs ?? SEVEN_DAYS_MS;
  }

  // --- Token operations (existing behavior preserved) ---

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

      const email = parts.slice(0, -1).join(':');
      return { valid: true, email };
    } catch {
      return { valid: false };
    }
  }

  // --- Invite management ---

  async createInvite(
    email: string,
    name: string,
    invitedBy: string,
    options?: { role?: string; baseUrl?: string },
  ): Promise<InviteResult> {
    const token = this.generateToken(email);
    const tokenHash = this.hashToken(token);
    const role = (options?.role ?? 'tester') as 'tester' | 'admin';
    const base = options?.baseUrl ?? this.baseUrl;

    const user = await this.storage.createUser({
      email,
      name,
      tokenHash,
      role,
      invitedBy,
    });

    const inviteUrl = `${base}/join?token=${token}`;
    return { user, token, inviteUrl };
  }

  async revokeAccess(email: string): Promise<void> {
    await this.storage.revokeUser(email);
  }

  async listUsers(): Promise<User[]> {
    return this.storage.listUsers();
  }

  // --- Session operations ---

  async createSession(email: string): Promise<string> {
    const user = await this.storage.getUserByEmail(email);
    if (!user) {
      throw new Error('User not found');
    }
    if (user.revoked) {
      throw new Error('User access has been revoked');
    }

    const expiresAt = new Date(Date.now() + this.sessionTtlMs).toISOString();
    const session = await this.storage.createSession(email, expiresAt);
    return session.id;
  }

  async validateSession(sessionId: string): Promise<User | null> {
    const session = await this.storage.getSession(sessionId);
    if (!session) {
      return null;
    }

    if (new Date(session.expiresAt) <= new Date()) {
      await this.storage.deleteSession(sessionId);
      return null;
    }

    const user = await this.storage.getUserByEmail(session.userEmail);
    if (!user || user.revoked) {
      return null;
    }

    return user;
  }

  async destroySession(sessionId: string): Promise<void> {
    await this.storage.deleteSession(sessionId);
  }

  // --- Internal ---

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('hex');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
