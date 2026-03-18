import { z } from 'zod';

export const createIssueResponseSchema = z.object({
  html_url: z.string(),
  id: z.number(),
  number: z.number(),
});

export const searchIssuesResponseSchema = z.object({
  items: z.array(
    z.object({
      html_url: z.string(),
      number: z.number(),
      title: z.string(),
    }),
  ),
});

export const labelResponseSchema = z.array(
  z.object({
    name: z.string(),
  }),
);

export type CreateIssueResponse = z.infer<typeof createIssueResponseSchema>;
export type SearchIssuesResponse = z.infer<typeof searchIssuesResponseSchema>;
export type LabelResponse = z.infer<typeof labelResponseSchema>;
