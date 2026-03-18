import { Router } from 'express';

export function usersRouter(): Router {
  const router = Router();

  router.get('/me', (req, res) => {
    const { id, email, name, role } = req.user!;
    res.json({ success: true, data: { id, email, name, role } });
  });

  return router;
}
