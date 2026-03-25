import {
  roundSchema,
  resultSchema,
  userSchema,
  sessionSchema,
  accessRequestSchema,
  projectSchema,
  projectUserSchema,
} from '../../shared/schemas.js';
import type {
  Round,
  Result,
  User,
  Session,
  AccessRequest,
  AccessRequestStatus,
  Project,
  ProjectUser,
} from '../../shared/types.js';

/**
 * Normalize a timestamp value to an ISO string.
 * Handles both Date objects (from Postgres) and strings (from SQLite).
 */
function toISOString(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

// --- Generic row shapes (union of SQLite string timestamps and Postgres Date timestamps) ---

export interface ProjectRow {
  id: string;
  repo_slug: string;
  name: string;
  github_token_encrypted: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface ProjectUserRow {
  project_id: string;
  user_email: string;
  role: string;
  created_at: Date | string;
}

export interface RoundRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_by_email: string;
  created_by_name: string;
  created_at: Date | string;
  completed_at: Date | string | null;
  project_id: string | null;
}

export interface ResultRow {
  id: string;
  round_id: string;
  test_id: string;
  status: string;
  tester_name: string;
  tester_email: string;
  description: string | null;
  severity: string | null;
  commit_hash: string | null;
  issue_url: string | null;
  issue_number: number | null;
  created_at: Date | string;
  updated_at: Date | string;
  project_id: string | null;
}

export interface SessionRow {
  id: string;
  user_email: string;
  expires_at: Date | string;
  created_at: Date | string;
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  token_hash: string;
  role: string;
  invited_by: string;
  revoked: number | boolean;
  created_at: Date | string;
}

export interface AccessRequestRow {
  id: string;
  email: string;
  name: string;
  status: string;
  message: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | string | null;
  created_at: Date | string;
  project_id: string | null;
}

// --- Row conversion functions ---

export function rowToProject(row: ProjectRow): Project {
  return projectSchema.parse({
    id: row.id,
    repoSlug: row.repo_slug,
    name: row.name,
    githubTokenEncrypted: row.github_token_encrypted,
    createdAt: toISOString(row.created_at),
    updatedAt: toISOString(row.updated_at),
  });
}

export function rowToProjectUser(row: ProjectUserRow): ProjectUser {
  return projectUserSchema.parse({
    projectId: row.project_id,
    userEmail: row.user_email,
    role: row.role,
    createdAt: toISOString(row.created_at),
  });
}

export function rowToRound(row: RoundRow): Round {
  return roundSchema.parse({
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    createdByEmail: row.created_by_email,
    createdByName: row.created_by_name,
    createdAt: toISOString(row.created_at),
    completedAt: toISOString(row.completed_at),
    projectId: row.project_id,
  });
}

export function rowToResult(row: ResultRow): Result {
  return resultSchema.parse({
    id: row.id,
    roundId: row.round_id,
    testId: row.test_id,
    status: row.status,
    testerName: row.tester_name,
    testerEmail: row.tester_email,
    description: row.description,
    severity: row.severity,
    commitHash: row.commit_hash,
    issueUrl: row.issue_url,
    issueNumber: row.issue_number,
    createdAt: toISOString(row.created_at),
    updatedAt: toISOString(row.updated_at),
    projectId: row.project_id,
  });
}

export function rowToSession(row: SessionRow): Session {
  return sessionSchema.parse({
    id: row.id,
    userEmail: row.user_email,
    expiresAt: toISOString(row.expires_at),
    createdAt: toISOString(row.created_at),
  });
}

export function rowToUser(row: UserRow): User {
  return userSchema.parse({
    id: row.id,
    email: row.email,
    name: row.name,
    tokenHash: row.token_hash,
    role: row.role,
    invitedBy: row.invited_by,
    // SQLite returns 0/1, Postgres returns native boolean
    revoked: typeof row.revoked === 'number' ? row.revoked === 1 : row.revoked,
    createdAt: toISOString(row.created_at),
  });
}

export function rowToAccessRequest(row: AccessRequestRow): AccessRequest {
  return accessRequestSchema.parse({
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status as AccessRequestStatus,
    message: row.message,
    reviewedBy: row.reviewed_by,
    reviewedAt: toISOString(row.reviewed_at),
    createdAt: toISOString(row.created_at),
    projectId: row.project_id,
  });
}
