import type { Request, Response, NextFunction } from 'express';
import type { StorageAdapter } from '../../adapters/storage/types.js';
import type { Project } from '../../shared/types.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      project?: Project;
    }
  }
}

/**
 * Middleware that extracts projectId from the URL parameter `:projectId`,
 * validates the project exists, and verifies the authenticated user has access.
 * Sets `req.project` for downstream handlers.
 */
export function requireProjectContext(storageAdapter: StorageAdapter) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const projectId = req.params.projectId as string;
      if (!projectId) {
        res.status(400).json({ success: false, error: 'Project ID is required' });
        return;
      }

      const project = await storageAdapter.getProject(projectId);
      if (!project) {
        res.status(404).json({ success: false, error: 'Project not found' });
        return;
      }

      // Admin users have access to all projects
      if (req.user?.role !== 'admin') {
        const userProjects = await storageAdapter.listUserProjects(req.user!.email);
        const hasAccess = userProjects.some((p) => p.id === projectId);
        if (!hasAccess) {
          res.status(403).json({ success: false, error: 'Access denied to this project' });
          return;
        }
      }

      req.project = project;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware that resolves the "default project" and attaches it to `req.project`.
 * Used for legacy unscoped routes (`/api/rounds`, `/api/results`, etc.)
 * so they continue working during the transition to project-scoped routes.
 */
export function defaultProjectContext(storageAdapter: StorageAdapter) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // If project is already set (e.g., from project-scoped route), skip
      if (req.project) {
        next();
        return;
      }

      const projects = await storageAdapter.listProjects();
      if (projects.length === 0) {
        // No projects yet — operate without project context (backward compat)
        next();
        return;
      }

      // Use the first (most recently created) project as default
      req.project = projects[0];
      next();
    } catch (err) {
      next(err);
    }
  };
}
