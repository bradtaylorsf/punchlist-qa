import type { User } from '../../shared/types.js';

export interface TokenValidation {
  valid: boolean;
  email?: string;
}

export interface InviteResult {
  user: User;
  token: string;
  inviteUrl: string;
}

export interface AuthAdapter {
  // Token operations (existing)
  generateToken(email: string): string;
  validateToken(token: string): TokenValidation;

  // Invite management (uses StorageAdapter)
  createInvite(
    email: string,
    name: string,
    invitedBy: string,
    options?: { role?: string; baseUrl?: string },
  ): Promise<InviteResult>;
  revokeAccess(email: string): Promise<void>;
  regenerateToken(email: string, options?: { baseUrl?: string }): Promise<InviteResult>;
  listUsers(): Promise<User[]>;

  // Login (validates token hash against stored user, creates session)
  loginWithToken(token: string): Promise<string>;

  // Session operations (for Express middleware in Epic 7)
  createSession(email: string): Promise<string>;
  validateSession(sessionId: string): Promise<User | null>;
  destroySession(sessionId: string): Promise<void>;
}
