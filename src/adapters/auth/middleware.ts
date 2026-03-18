import type { AuthAdapter } from './types.js';
import type { User } from '../../shared/types.js';
import { SESSION_TTL_MS } from '../../shared/constants.js';

export interface SessionCookieOptions {
  name?: string;
  secure?: boolean;
  sameSite?: string;
  maxAgeMs?: number;
  path?: string;
}

function resolveOptions(options?: SessionCookieOptions) {
  return {
    name: options?.name ?? 'punchlist_session',
    secure: options?.secure ?? process.env.NODE_ENV === 'production',
    sameSite: options?.sameSite ?? 'Lax',
    maxAgeMs: options?.maxAgeMs ?? SESSION_TTL_MS,
    path: options?.path ?? '/',
  };
}

/**
 * Parse a specific cookie from the Cookie header.
 */
export function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;

  const pairs = header.split(';');
  for (const pair of pairs) {
    const [key, ...rest] = pair.split('=');
    if (key.trim() === name) {
      return rest.join('=').trim();
    }
  }
  return undefined;
}

/**
 * Build a Set-Cookie header value.
 */
export function buildSetCookie(name: string, value: string, options?: SessionCookieOptions): string {
  const opts = resolveOptions(options);
  const parts = [
    `${name}=${value}`,
    `Path=${opts.path}`,
    `HttpOnly`,
    `SameSite=${opts.sameSite}`,
    `Max-Age=${Math.floor(opts.maxAgeMs / 1000)}`,
  ];
  if (opts.secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

/**
 * Build a clear-cookie header value (maxAge=0).
 */
export function buildClearCookie(name: string, options?: SessionCookieOptions): string {
  const opts = resolveOptions(options);
  const parts = [
    `${name}=`,
    `Path=${opts.path}`,
    `HttpOnly`,
    `SameSite=${opts.sameSite}`,
    `Max-Age=0`,
  ];
  if (opts.secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

/**
 * Handle login: validate token against stored hash, create session, return cookie.
 */
export async function handleLogin(
  auth: AuthAdapter,
  token: string,
  options?: SessionCookieOptions,
): Promise<{ sessionId: string; cookie: string } | { error: string; status: number }> {
  const opts = resolveOptions(options);

  try {
    const sessionId = await auth.loginWithToken(token);
    const cookie = buildSetCookie(opts.name, sessionId, options);
    return { sessionId, cookie };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Login failed';
    const status = message.includes('Invalid') || message.includes('not recognized') ? 401 : 403;
    return { error: message, status };
  }
}

/**
 * Handle logout: destroy session, return clear-cookie.
 */
export async function handleLogout(
  auth: AuthAdapter,
  sessionId: string,
  options?: SessionCookieOptions,
): Promise<{ cookie: string }> {
  const opts = resolveOptions(options);
  await auth.destroySession(sessionId);
  const cookie = buildClearCookie(opts.name, options);
  return { cookie };
}

/**
 * Authenticate a request: validate session cookie, return user or null.
 */
export async function authenticateRequest(
  auth: AuthAdapter,
  cookieHeader: string | undefined,
  options?: SessionCookieOptions,
): Promise<User | null> {
  const opts = resolveOptions(options);
  const sessionId = parseCookie(cookieHeader, opts.name);
  if (!sessionId) {
    return null;
  }
  return auth.validateSession(sessionId);
}
