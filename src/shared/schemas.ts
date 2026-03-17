import { z } from 'zod';

// --- Enums ---

export const issueTrackerTypeSchema = z.enum(['github', 'jira', 'linear']);
export const storageAdapterTypeSchema = z.enum(['sqlite', 'dynamodb', 'file']);
export const authAdapterTypeSchema = z.enum(['token', 'auth0']);
export const aiToolChoiceSchema = z.enum(['claude-code', 'codex', 'none']);
export const widgetPositionSchema = z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']);
export const widgetThemeSchema = z.enum(['light', 'dark']);
export const testResultStatusSchema = z.enum(['pass', 'fail', 'skip', 'blocked']);
export const testCasePrioritySchema = z.enum(['high', 'medium', 'low']);

// --- Sub-schemas ---

export const issueTrackerConfigSchema = z.object({
  type: issueTrackerTypeSchema,
  repo: z.string().min(1, 'issueTracker.repo is required'),
});

export const storageConfigSchema = z.object({
  type: storageAdapterTypeSchema,
  path: z.string(),
});

export const authConfigSchema = z.object({
  type: authAdapterTypeSchema,
});

export const widgetConfigSchema = z.object({
  position: widgetPositionSchema,
  theme: widgetThemeSchema,
  corsDomains: z.array(z.string()),
  categories: z.array(z.string()).default([]),
});

export const categorySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
});

export const testCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+-\d{3}$/, 'Test case ID must match pattern: prefix-NNN (e.g. auth-001)'),
  title: z.string().min(1),
  category: z.string().min(1),
  priority: testCasePrioritySchema,
  instructions: z.string().min(1),
  expectedResult: z.string(),
});

export const testResultSchema = z.object({
  testCaseId: z.string(),
  status: testResultStatusSchema,
  issueUrl: z.string().optional(),
  notes: z.string().optional(),
});

export const testRoundSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  commitSha: z.string(),
  testerEmail: z.string(),
  results: z.array(testResultSchema),
});

export const testerSchema = z.object({
  email: z.string().email(),
  token: z.string(),
  createdAt: z.string(),
  revokedAt: z.string().optional(),
});

// --- Main config schema ---

export const punchlistConfigSchema = z.object({
  projectName: z.string().min(1, 'projectName is required'),
  issueTracker: issueTrackerConfigSchema,
  storage: storageConfigSchema,
  auth: authConfigSchema,
  widget: widgetConfigSchema,
  aiTool: aiToolChoiceSchema,
  categories: z.array(categorySchema).default([]),
  testCases: z.array(testCaseSchema),
  testers: z.array(testerSchema),
});

// --- Inferred types ---

export type PunchlistConfig = z.infer<typeof punchlistConfigSchema>;
export type IssueTrackerConfig = z.infer<typeof issueTrackerConfigSchema>;
export type StorageConfig = z.infer<typeof storageConfigSchema>;
export type AuthConfig = z.infer<typeof authConfigSchema>;
export type WidgetConfig = z.infer<typeof widgetConfigSchema>;
export type TestCase = z.infer<typeof testCaseSchema>;
export type TestRound = z.infer<typeof testRoundSchema>;
export type TestResult = z.infer<typeof testResultSchema>;
export type Tester = z.infer<typeof testerSchema>;
export type IssueTrackerType = z.infer<typeof issueTrackerTypeSchema>;
export type StorageAdapterType = z.infer<typeof storageAdapterTypeSchema>;
export type AuthAdapterType = z.infer<typeof authAdapterTypeSchema>;
export type AIToolChoice = z.infer<typeof aiToolChoiceSchema>;
export type Category = z.infer<typeof categorySchema>;
export type TestCasePriority = z.infer<typeof testCasePrioritySchema>;
