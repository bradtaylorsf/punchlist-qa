---
name: auth-patterns
description: Token-based JWT auth, signed invite links, middleware patterns for the QA dashboard
metadata:
  short-description: Authentication and authorization patterns
---

# Auth Patterns

Use this skill when implementing authentication, authorization, or invite flows.

## Use When

- "How do testers authenticate?"
- "Generate an invite link"
- "Protect this endpoint"
- "Add role-based access"

## Architecture

The QA dashboard uses **token-based JWT auth** with signed invite links. No third-party auth dependency (no Auth0, no OAuth). Simple and self-contained.

Flow:
1. Admin generates a signed invite link
2. Tester clicks the link → server verifies the JWT → creates a session
3. Session token is stored in an HTTP-only cookie
4. Protected routes validate the session token via middleware

## Invite Link Generation

```typescript
import jwt from 'jsonwebtoken';

function generateInviteLink(email: string, role: 'tester' | 'admin'): string {
  const token = jwt.sign(
    { email, role, type: 'invite' },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
  return `${config.dashboardUrl}/auth/accept?token=${token}`;
}
```

## Invite Acceptance

```typescript
// POST /api/auth/verify
export async function verifyInvite(req: Request, res: Response) {
  const { token } = req.body;
  const payload = jwt.verify(token, config.jwtSecret) as InvitePayload;

  if (payload.type !== 'invite') {
    throw new ValidationError('Invalid token type');
  }

  // Create or find tester
  const tester = testerService.findOrCreate({
    email: payload.email,
    role: payload.role,
  });

  // Issue session token
  const sessionToken = jwt.sign(
    { testerId: tester.id, role: tester.role, type: 'session' },
    config.jwtSecret,
    { expiresIn: '30d' }
  );

  res.cookie('session', sessionToken, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });

  res.json({ data: { tester } });
}
```

## Auth Middleware

```typescript
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies.session;
  if (!token) throw new UnauthorizedError();

  const payload = jwt.verify(token, config.jwtSecret) as SessionPayload;
  if (payload.type !== 'session') throw new UnauthorizedError();

  req.user = { testerId: payload.testerId, role: payload.role };
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') throw new ForbiddenError();
    next();
  });
}
```

## Route Protection

```typescript
// Public routes
router.post('/api/auth/verify', verifyInvite);
router.post('/api/widget/tickets', widgetTicketHandler);

// Authenticated routes
router.get('/api/test-rounds', requireAuth, listTestRounds);
router.post('/api/test-rounds/:id/results', requireAuth, submitResult);

// Admin-only routes
router.post('/api/auth/invite', requireAdmin, createInvite);
router.delete('/api/test-cases/:id', requireAdmin, deleteTestCase);
```

## Roles

| Role | Permissions |
|------|-------------|
| `tester` | View test cases, submit results, view own history |
| `admin` | Everything + invite testers, manage test cases, configure settings |

## JWT Secret Management

- Store in environment variable: `JWT_SECRET`
- Generate a strong random secret: `openssl rand -base64 32`
- Never commit the secret to the repository
- Rotate by issuing a new secret and invalidating old sessions

## Guardrails

- Never store plaintext passwords — this system is token-only
- Always use HTTP-only cookies for session tokens
- Always set `secure: true` in production
- Always validate token `type` field to prevent invite tokens being used as sessions
- Never log JWT tokens or secrets
- Set reasonable expiry times (7d for invites, 30d for sessions)
- Widget endpoints are public but CORS-restricted — they don't use auth tokens
