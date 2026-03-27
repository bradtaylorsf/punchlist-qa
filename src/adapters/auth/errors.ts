/**
 * Thrown when a token is malformed or cannot be verified (bad HMAC signature).
 * Maps to HTTP 401.
 */
export class InvalidTokenError extends Error {
  constructor(message = 'Invalid or expired token') {
    super(message);
    this.name = 'InvalidTokenError';
    Error.captureStackTrace?.(this, InvalidTokenError);
  }
}

/**
 * Thrown when a token has a valid HMAC signature but its hash is not found in
 * storage (e.g. the token was never used to create an invite).
 * Maps to HTTP 401.
 */
export class UnrecognizedTokenError extends Error {
  constructor(message = 'Token not recognized') {
    super(message);
    this.name = 'UnrecognizedTokenError';
    Error.captureStackTrace?.(this, UnrecognizedTokenError);
  }
}

/**
 * Thrown when a user's access has been revoked.
 * Maps to HTTP 403.
 */
export class RevokedUserError extends Error {
  constructor(message = 'User access has been revoked') {
    super(message);
    this.name = 'RevokedUserError';
    Error.captureStackTrace?.(this, RevokedUserError);
  }
}

/**
 * Thrown when email/password credentials are invalid.
 * Maps to HTTP 401.
 */
export class InvalidCredentialsError extends Error {
  constructor(message = 'Invalid email or password') {
    super(message);
    this.name = 'InvalidCredentialsError';
    Error.captureStackTrace?.(this, InvalidCredentialsError);
  }
}

/**
 * Thrown when a user has no password set (invite-only account that hasn't set a password).
 * Maps to HTTP 403.
 */
export class PasswordNotSetError extends Error {
  constructor(message = 'Password not set. Use your invite link to set a password.') {
    super(message);
    this.name = 'PasswordNotSetError';
    Error.captureStackTrace?.(this, PasswordNotSetError);
  }
}

/**
 * Thrown when attempting first-run setup but users already exist.
 * Maps to HTTP 409.
 */
export class SetupAlreadyCompleteError extends Error {
  constructor(message = 'Setup has already been completed') {
    super(message);
    this.name = 'SetupAlreadyCompleteError';
    Error.captureStackTrace?.(this, SetupAlreadyCompleteError);
  }
}
