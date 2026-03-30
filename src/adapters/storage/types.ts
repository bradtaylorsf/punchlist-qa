import type {
  Round,
  Result,
  User,
  AccessRequest,
  Project,
  ProjectUser,
  GitHubToken,
  CreateRoundInput,
  UpdateRoundInput,
  SubmitResultInput,
  CreateUserInput,
  CreateAccessRequestInput,
  CreateProjectInput,
  UpdateProjectInput,
} from '../../shared/types.js';

export interface StorageAdapter {
  /** Initialize the storage backend (create tables, run migrations, etc.) */
  initialize(): Promise<void>;

  /** Close the storage connection */
  close(): Promise<void>;

  // --- Projects ---

  /** Create a new project */
  createProject(input: CreateProjectInput): Promise<Project>;

  /** Get a project by ID, or null if not found */
  getProject(id: string): Promise<Project | null>;

  /** Get a project by repo slug, or null if not found */
  getProjectByRepoSlug(repoSlug: string): Promise<Project | null>;

  /** Get a project by name, or null if not found */
  getProjectByName(name: string): Promise<Project | null>;

  /** List all projects */
  listProjects(): Promise<Project[]>;

  /** Update a project's mutable fields */
  updateProject(id: string, input: UpdateProjectInput): Promise<Project>;

  /** Delete a project by ID (idempotent) */
  deleteProject(id: string): Promise<void>;

  // --- Project Users ---

  /** Add a user to a project */
  addUserToProject(projectId: string, userEmail: string, role?: string): Promise<ProjectUser>;

  /** Remove a user from a project (idempotent) */
  removeUserFromProject(projectId: string, userEmail: string): Promise<void>;

  /** List all users in a project */
  listProjectUsers(projectId: string): Promise<ProjectUser[]>;

  /** List all projects a user has access to */
  listUserProjects(userEmail: string): Promise<Project[]>;

  // --- Rounds ---

  /** Create a new QA round */
  createRound(input: CreateRoundInput, projectId?: string): Promise<Round>;

  /** List all rounds, ordered by creation date descending. If projectId is provided, filter by project. */
  listRounds(projectId?: string): Promise<Round[]>;

  /** Get a single round by ID, or null if not found */
  getRound(id: string): Promise<Round | null>;

  /** Update a round's mutable fields */
  updateRound(id: string, input: UpdateRoundInput): Promise<Round>;

  // --- Results ---

  /** Submit a test result (insert or replace if same round+test combo exists) */
  submitResult(roundId: string, input: SubmitResultInput, projectId?: string): Promise<Result>;

  /** List all results for a given round */
  listResults(roundId: string, projectId?: string): Promise<Result[]>;

  /** Delete a single result by ID */
  deleteResult(id: string): Promise<void>;

  /** Delete all results matching the given test IDs within a round. Returns the count of deleted rows. */
  deleteResultsByTestIds(roundId: string, testIds: string[]): Promise<number>;

  /** Update the linked issue on a result */
  updateResultIssue(id: string, issueUrl: string, issueNumber: number): Promise<Result>;

  // --- Users ---

  /** Create a new user */
  createUser(input: CreateUserInput): Promise<User>;

  /** List all users */
  listUsers(): Promise<User[]>;

  /** Get a user by email, or null if not found */
  getUserByEmail(email: string): Promise<User | null>;

  /** Get a user by token hash, or null if not found */
  getUserByTokenHash(tokenHash: string): Promise<User | null>;

  /** Revoke a user's access */
  revokeUser(email: string): Promise<void>;

  /** Update a user's token hash (for token regeneration) */
  updateUserTokenHash(email: string, newTokenHash: string): Promise<void>;

  /** Update a user's password hash */
  updateUserPasswordHash(email: string, passwordHash: string): Promise<void>;

  /** Get a user's stored password hash, or null if none set */
  getUserPasswordHash(email: string): Promise<string | null>;

  /** Count total number of users (used to detect first-run setup) */
  countUsers(): Promise<number>;

  // --- Config (key-value) ---

  /** Get a config value by key, or null if not set */
  getConfig(key: string): Promise<string | null>;

  /** Set a config value (insert or update) */
  setConfig(key: string, value: string): Promise<void>;

  // --- Access Requests ---

  /** Create an access request */
  createAccessRequest(input: CreateAccessRequestInput, projectId?: string): Promise<AccessRequest>;

  /** List access requests, optionally filtered by status */
  listAccessRequests(status?: string, projectId?: string): Promise<AccessRequest[]>;

  /** Get access request by ID */
  getAccessRequest(id: string): Promise<AccessRequest | null>;

  /** Get access request by email */
  getAccessRequestByEmail(email: string): Promise<AccessRequest | null>;

  /** Update access request status */
  updateAccessRequestStatus(id: string, status: string, reviewedBy: string): Promise<AccessRequest>;

  // --- GitHub Tokens ---

  /** Create or update a GitHub token for an owner (upsert) */
  createOrUpdateGitHubToken(owner: string, tokenEncrypted: string): Promise<GitHubToken>;

  /** Get a GitHub token entry by owner, or null if not found */
  getGitHubToken(owner: string): Promise<GitHubToken | null>;

  /** Get the encrypted token string for an owner, or null if not found */
  getGitHubTokenEncrypted(owner: string): Promise<string | null>;

  /** List all registered GitHub token entries (tokens are NOT included) */
  listGitHubTokens(): Promise<GitHubToken[]>;

  /** Delete a GitHub token by owner (idempotent) */
  deleteGitHubToken(owner: string): Promise<void>;
}
