---
name: session-management
description: Session lifecycle, cleanup strategies, storage security, and cookie security
metadata:
  short-description: Session management patterns
---

# Session Management

Use this skill when implementing server-side session handling.

## Use When

- "How should sessions be created and stored?"
- "Implement session cleanup"
- "Secure session cookies"
- "Handle session expiry"
- "Add logout functionality"

## Session Lifecycle

Create sessions with cryptographically random IDs (32+ bytes). Set reasonable expiry and validate on every request:

```typescript
import { randomBytes } from 'crypto';

interface Session {
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}

function createSession(userId: string, ttlMs = 24 * 60 * 60 * 1000): Session {
  const id = randomBytes(32).toString('hex'); // 64-char hex string
  const now = new Date();
  return {
    id,
    userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + ttlMs),
  };
}
```

Validate session on every request via middleware:

```typescript
export function requireSession(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.cookies[SESSION_COOKIE_NAME];
  if (!sessionId) throw new UnauthorizedError('No session');

  const session = sessionStore.findById(sessionId);
  if (!session) throw new UnauthorizedError('Invalid session');
  if (new Date() > session.expiresAt) {
    sessionStore.delete(sessionId);
    throw new UnauthorizedError('Session expired');
  }

  req.session = session;
  next();
}
```

Delete session on logout:

```typescript
export function logout(req: Request, res: Response) {
  const sessionId = req.cookies[SESSION_COOKIE_NAME];
  if (sessionId) {
    sessionStore.delete(sessionId); // Idempotent — no-op if missing
  }
  res.clearCookie(SESSION_COOKIE_NAME);
  res.json({ data: { message: 'Logged out' } });
}
```

## Cleanup Strategies

Implement periodic cleanup via `setInterval` with `unref()` so the timer does not prevent process exit. Return a stop function for graceful shutdown:

```typescript
function startSessionCleanup(
  store: SessionStore,
  intervalMs = 60 * 60 * 1000 // Default: 1 hour
): () => void {
  const timer = setInterval(() => {
    const now = new Date();
    store.deleteExpiredBefore(now);
  }, intervalMs);

  timer.unref(); // Don't keep process alive just for cleanup

  return () => clearInterval(timer); // Stop function for graceful shutdown
}

// Usage
const stopCleanup = startSessionCleanup(sessionStore);
process.on('SIGTERM', () => {
  stopCleanup();
  server.close();
});
```

Alternative: cleanup on every N-th request for simpler deployments:

```typescript
let requestCount = 0;
const CLEANUP_INTERVAL = 100; // Every 100 requests

function maybeCleanup(store: SessionStore): void {
  requestCount++;
  if (requestCount % CLEANUP_INTERVAL === 0) {
    store.deleteExpiredBefore(new Date());
  }
}
```

## Storage Security

Store session IDs as hashes (not plaintext) if the storage layer could be compromised:

```typescript
import { createHash } from 'crypto';

function hashSessionId(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex');
}

// Store hashed ID in the database
function storeSession(session: Session): void {
  db.run(
    'INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)',
    [hashSessionId(session.id), session.userId, session.expiresAt.toISOString()]
  );
}

// Look up by hashing the incoming ID
function findSession(sessionId: string): Session | undefined {
  return db.get(
    'SELECT * FROM sessions WHERE id_hash = ?',
    [hashSessionId(sessionId)]
  );
}
```

Use `randomBytes(32)` for session ID generation — never `Math.random()` or UUIDs:

```typescript
// GOOD — cryptographically random
const sessionId = randomBytes(32).toString('hex');

// BAD — predictable
const sessionId = Math.random().toString(36);
const sessionId = crypto.randomUUID(); // UUIDv4 has only 122 bits of randomness
```

Enforce foreign key constraints (session -> user):

```sql
CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
```

## Cookie Security

Configure cookies with all security flags:

```typescript
const SESSION_COOKIE_NAME = 'punchlist_session';

function setSessionCookie(res: Response, sessionId: string, maxAgeMs: number): void {
  res.cookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,           // Prevents XSS access via document.cookie
    secure: config.isProduction, // HTTPS only in production
    sameSite: 'lax',          // Prevents CSRF on cross-origin POST
    path: '/',                // Available site-wide
    maxAge: maxAgeMs,
  });
}
```

Cookie flag reference:

| Flag | Purpose |
|------|---------|
| `httpOnly` | Prevents JavaScript access via `document.cookie` (XSS protection) |
| `secure` | Cookie only sent over HTTPS (set `true` in production) |
| `sameSite: 'lax'` | Sent on same-site requests and top-level navigations (CSRF protection) |
| `sameSite: 'strict'` | Only sent on same-site requests (stricter CSRF, may break OAuth flows) |
| `path` | Cookie scope — use `'/'` unless you need to restrict |
| `maxAge` | Expiry in milliseconds — align with server-side session TTL |

## Guardrails

- Always use `randomBytes(32)` for session ID generation — never `Math.random()`
- Always set `httpOnly: true` on session cookies
- Always set `secure: true` in production
- Always set `sameSite` to `'lax'` or `'strict'`
- Always validate sessions on every request via middleware
- Always delete sessions on logout (idempotent — no-op if missing)
- Always implement session cleanup to prevent unbounded storage growth
- Always use `unref()` on cleanup timers to avoid preventing process exit
- Never log session IDs or tokens
- Never store plaintext session IDs if the storage layer could be compromised
