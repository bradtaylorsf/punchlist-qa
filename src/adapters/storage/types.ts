import type {
  Round,
  Result,
  User,
  Session,
  AccessRequest,
  CreateRoundInput,
  UpdateRoundInput,
  SubmitResultInput,
  CreateUserInput,
  CreateAccessRequestInput,
} from '../../shared/types.js';

export interface StorageAdapter {
  /** Initialize the storage backend (create tables, run migrations, etc.) */
  initialize(): Promise<void>;

  /** Close the storage connection */
  close(): Promise<void>;

  // --- Rounds ---

  /** Create a new QA round */
  createRound(input: CreateRoundInput): Promise<Round>;

  /** List all rounds, ordered by creation date descending */
  listRounds(): Promise<Round[]>;

  /** Get a single round by ID, or null if not found */
  getRound(id: string): Promise<Round | null>;

  /** Update a round's mutable fields */
  updateRound(id: string, input: UpdateRoundInput): Promise<Round>;

  // --- Results ---

  /** Submit a test result (insert or replace if same round+test combo exists) */
  submitResult(roundId: string, input: SubmitResultInput): Promise<Result>;

  /** List all results for a given round */
  listResults(roundId: string): Promise<Result[]>;

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

  // --- Config (key-value) ---

  /** Get a config value by key, or null if not set */
  getConfig(key: string): Promise<string | null>;

  /** Set a config value (insert or update) */
  setConfig(key: string, value: string): Promise<void>;

  // --- Sessions ---

  /** Create a new session */
  createSession(userEmail: string, expiresAt: string): Promise<Session>;

  /** Get a session by ID, or null if not found */
  getSession(id: string): Promise<Session | null>;

  /** Get a session with its associated user in a single query, or null if not found */
  getSessionWithUser(id: string): Promise<{ session: Session; user: User } | null>;

  /** Delete a session by ID */
  deleteSession(id: string): Promise<void>;

  /** Delete all expired sessions */
  deleteExpiredSessions(): Promise<void>;

  // --- Access Requests ---

  /** Create an access request */
  createAccessRequest(input: CreateAccessRequestInput): Promise<AccessRequest>;

  /** List access requests, optionally filtered by status */
  listAccessRequests(status?: string): Promise<AccessRequest[]>;

  /** Get access request by ID */
  getAccessRequest(id: string): Promise<AccessRequest | null>;

  /** Get access request by email */
  getAccessRequestByEmail(email: string): Promise<AccessRequest | null>;

  /** Update access request status */
  updateAccessRequestStatus(id: string, status: string, reviewedBy: string): Promise<AccessRequest>;
}
