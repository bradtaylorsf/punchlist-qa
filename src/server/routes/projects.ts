import { Router } from 'express';
import type { StorageAdapter } from '../../adapters/storage/types.js';
import { z } from 'zod';
import { updateProjectInputSchema } from '../../shared/schemas.js';
import { requireAdmin } from '../middleware/require-admin.js';

/**
 * Parse a GitHub URL or repo slug into a normalized `owner/repo` slug.
 * Accepts:
 *   - `owner/repo`
 *   - `https://github.com/owner/repo`
 *   - `https://github.com/owner/repo.git`
 *   - `github.com/owner/repo`
 */
function parseRepoSlug(input: string): string {
  const trimmed = input.trim().replace(/\.git$/, '').replace(/\/+$/, '');

  // If it looks like a URL, extract owner/repo from the path
  const urlPattern = /(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+\/[^/]+)/;
  const match = trimmed.match(urlPattern);
  if (match) return match[1];

  // If it's already owner/repo format, return as-is
  const slugPattern = /^[^/]+\/[^/]+$/;
  if (slugPattern.test(trimmed)) return trimmed;

  throw new Error(`Invalid repo format: expected "owner/repo" or a GitHub URL`);
}

const createProjectBodySchema = z.object({
  repoSlug: z.string().min(1),
  name: z.string().min(1).optional(),
});

export function projectsRouter(storageAdapter: StorageAdapter): Router {
  const router = Router();

  // List projects — users see their projects, admins see all
  router.get('/', async (req, res, next) => {
    try {
      if (req.user!.role === 'admin') {
        const projects = await storageAdapter.listProjects();
        res.json({ success: true, data: projects });
      } else {
        const projects = await storageAdapter.listUserProjects(req.user!.email);
        res.json({ success: true, data: projects });
      }
    } catch (err) {
      next(err);
    }
  });

  // Create project (admin only)
  router.post('/', requireAdmin, async (req, res, next) => {
    try {
      const body = createProjectBodySchema.parse(req.body);
      const repoSlug = parseRepoSlug(body.repoSlug);
      const project = await storageAdapter.createProject({
        repoSlug,
        name: body.name,
      });

      // Auto-add the creating admin to the project
      await storageAdapter.addUserToProject(project.id, req.user!.email, 'admin');

      res.status(201).json({ success: true, data: project });
    } catch (err) {
      next(err);
    }
  });

  // Get project details
  router.get('/:projectId', async (req, res, next) => {
    try {
      const project = await storageAdapter.getProject(req.params.projectId as string);
      if (!project) {
        res.status(404).json({ success: false, error: 'Project not found' });
        return;
      }
      res.json({ success: true, data: project });
    } catch (err) {
      next(err);
    }
  });

  // Update project (admin only)
  router.put('/:projectId', requireAdmin, async (req, res, next) => {
    try {
      const input = updateProjectInputSchema.parse(req.body);
      const project = await storageAdapter.updateProject(req.params.projectId as string, input);
      res.json({ success: true, data: project });
    } catch (err) {
      next(err);
    }
  });

  // Delete project (admin only)
  router.delete('/:projectId', requireAdmin, async (req, res, next) => {
    try {
      await storageAdapter.deleteProject(req.params.projectId as string);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // --- Project Members ---

  // List project members
  router.get('/:projectId/users', async (req, res, next) => {
    try {
      const users = await storageAdapter.listProjectUsers(req.params.projectId as string);
      res.json({ success: true, data: users });
    } catch (err) {
      next(err);
    }
  });

  // Add user to project (admin only)
  router.post('/:projectId/users', requireAdmin, async (req, res, next) => {
    try {
      const { email, role } = req.body;
      if (!email) {
        res.status(400).json({ success: false, error: 'email is required' });
        return;
      }
      const projectUser = await storageAdapter.addUserToProject(
        req.params.projectId as string,
        email,
        role,
      );
      res.status(201).json({ success: true, data: projectUser });
    } catch (err) {
      next(err);
    }
  });

  // Remove user from project (admin only)
  router.delete('/:projectId/users/:email', requireAdmin, async (req, res, next) => {
    try {
      const email = z.string().email().parse(decodeURIComponent(req.params.email as string));
      await storageAdapter.removeUserFromProject(req.params.projectId as string, email);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
