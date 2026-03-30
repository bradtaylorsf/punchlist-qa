import { Router } from 'express';
import { supportTicketRequestSchema } from '../../shared/schemas.js';
import type { CreateSupportTicketOpts } from '../../shared/schemas.js';
import type { IssueAdapter } from '../../adapters/issues/types.js';
import type { IssueAdapterRegistry } from '../../adapters/issues/registry.js';
import type { StorageAdapter } from '../../adapters/storage/types.js';

/**
 * Maps the nested widget request to the flat CreateSupportTicketOpts
 * expected by the issue adapter.
 */
export function mapRequestToOpts(
  body: ReturnType<typeof supportTicketRequestSchema.parse>,
): CreateSupportTicketOpts {
  const ctx = body.context;
  return {
    subject: body.subject,
    description: body.description,
    category: body.category,
    userName: body.userName,
    userEmail: body.userEmail,
    userAgent: ctx?.userAgent,
    pageUrl: ctx?.pageUrl,
    screenSize: ctx?.screenSize,
    consoleErrors: ctx?.consoleErrors?.join('\n'),
    customContext: ctx?.customContext,
  };
}

export interface SupportRouterDeps {
  /** Fallback adapter for single-project (CLI) mode */
  issueAdapter: IssueAdapter;
  /** Registry for resolving per-project adapters in hosted mode */
  issueAdapterRegistry?: IssueAdapterRegistry;
  /** Storage adapter for looking up project repo slugs */
  storageAdapter?: StorageAdapter;
  /** Encryption secret for decrypting per-org GitHub tokens */
  encryptionSecret?: string;
}

export function supportRouter(deps: SupportRouterDeps): Router {
  const router = Router();

  router.post('/ticket', async (req, res, next) => {
    try {
      const parsed = supportTicketRequestSchema.parse(req.body);
      const opts = mapRequestToOpts(parsed);

      // Resolve the correct issue adapter based on projectId/projectName (hosted mode)
      // or fall back to the legacy single-project adapter (CLI mode)
      let adapter = deps.issueAdapter;

      if ((parsed.projectId || parsed.projectName) && deps.issueAdapterRegistry && deps.storageAdapter && deps.encryptionSecret) {
        const project = parsed.projectId
          ? await deps.storageAdapter.getProject(parsed.projectId)
          : await deps.storageAdapter.getProjectByName(parsed.projectName!);
        if (!project) {
          res.status(404).json({ success: false, error: 'Project not found' });
          return;
        }
        adapter = await deps.issueAdapterRegistry.getAdapter(
          project.repoSlug,
          deps.storageAdapter,
          deps.encryptionSecret,
        );
      }

      const result = await adapter.createSupportTicketIssue(opts);

      res.status(201).json({
        success: true,
        issueUrl: result.url,
        issueNumber: result.number,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
