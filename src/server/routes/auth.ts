import { Router } from 'express';
import type { AuthAdapter } from '../../adapters/auth/types.js';
import { loginRequestSchema } from '../../shared/schemas.js';
import { handleLogin, handleLogout, parseCookie } from '../../adapters/auth/middleware.js';

export function authRouter(authAdapter: AuthAdapter): Router {
  const router = Router();

  router.post('/login', async (req, res, next) => {
    try {
      const { token } = loginRequestSchema.parse(req.body);
      const result = await handleLogin(authAdapter, token);

      if ('error' in result) {
        res.status(result.status).json({ success: false, error: result.error });
        return;
      }

      res.setHeader('Set-Cookie', result.cookie);
      res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', async (req, res, next) => {
    try {
      const sessionId = parseCookie(req.headers.cookie, 'punchlist_session');
      if (sessionId) {
        const { cookie } = await handleLogout(authAdapter, sessionId);
        res.setHeader('Set-Cookie', cookie);
      }
      res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
