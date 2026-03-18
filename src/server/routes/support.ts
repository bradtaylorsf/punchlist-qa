import { Router } from 'express';
import { supportTicketRequestSchema } from '../../shared/schemas.js';
import type { CreateSupportTicketOpts } from '../../shared/schemas.js';
import type { IssueAdapter } from '../../adapters/issues/types.js';

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

export function supportRouter(issueAdapter: IssueAdapter): Router {
  const router = Router();

  router.post('/ticket', async (req, res, next) => {
    try {
      const parsed = supportTicketRequestSchema.parse(req.body);
      const opts = mapRequestToOpts(parsed);
      const result = await issueAdapter.createSupportTicketIssue(opts);

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
