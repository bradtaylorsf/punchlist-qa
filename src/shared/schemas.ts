import { z } from 'zod';
import { findClosestMatch } from './string-utils.js';

// --- Enums ---

export const issueTrackerTypeSchema = z.enum(['github', 'jira', 'linear']);
export const storageAdapterTypeSchema = z.enum(['sqlite', 'postgres', 'dynamodb', 'file']);
export const authAdapterTypeSchema = z.enum(['token', 'auth0']);
export const aiToolChoiceSchema = z.enum(['claude-code', 'codex', 'both', 'none']);
export const widgetPositionSchema = z.enum([
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
]);
export const widgetThemeSchema = z.enum(['light', 'dark']);
export const testResultStatusSchema = z.enum(['pass', 'fail', 'skip', 'blocked']);
export const testCasePrioritySchema = z.enum(['high', 'medium', 'low']);
export const roundStatusSchema = z.enum(['active', 'completed', 'archived']);
export const resultSeveritySchema = z.enum(['minor', 'broken', 'blocker']);
export const userRoleSchema = z.enum(['tester', 'admin']);

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
  id: z
    .string()
    .regex(
      /^[a-z][a-z0-9-]*-\d{3}$/,
      'Test case ID must match pattern: prefix-NNN (e.g. auth-001, user-auth-001)',
    ),
  title: z.string().min(1),
  category: z.string().min(1),
  priority: testCasePrioritySchema,
  instructions: z.string().min(1),
  expectedResult: z.string().min(1),
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

// --- Storage domain schemas (DB models, distinct from config-file schemas) ---

export const projectSchema = z.object({
  id: z.string().uuid(),
  repoSlug: z.string().min(1),
  name: z.string().min(1),
  githubTokenEncrypted: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const projectUserSchema = z.object({
  projectId: z.string().uuid(),
  userEmail: z.string().email(),
  role: userRoleSchema,
  createdAt: z.string(),
});

export const createProjectInputSchema = z.object({
  repoSlug: z.string().min(1),
  name: z.string().min(1).optional(),
});

export const updateProjectInputSchema = z.object({
  name: z.string().min(1).optional(),
});

export const roundSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  status: roundStatusSchema,
  createdByEmail: z.string().email(),
  createdByName: z.string(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  projectId: z.string().uuid().nullable(),
});

export const resultSchema = z.object({
  id: z.string().uuid(),
  roundId: z.string().uuid(),
  testId: z.string(),
  status: testResultStatusSchema,
  testerName: z.string(),
  testerEmail: z.string().email(),
  description: z.string().nullable(),
  severity: resultSeveritySchema.nullable(),
  commitHash: z.string().nullable(),
  issueUrl: z.string().nullable(),
  issueNumber: z.number().int().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  projectId: z.string().uuid().nullable(),
});

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  tokenHash: z.string(),
  role: userRoleSchema,
  invitedBy: z.string().email(),
  revoked: z.boolean(),
  createdAt: z.string(),
});

export const createRoundInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  createdByEmail: z.string().email(),
  createdByName: z.string().min(1),
});

export const updateRoundInputSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: roundStatusSchema.optional(),
  completedAt: z.string().nullable().optional(),
});

export const submitResultInputSchema = z.object({
  testId: z.string().min(1),
  status: testResultStatusSchema,
  testerName: z.string().min(1),
  testerEmail: z.string().email(),
  description: z.string().optional(),
  severity: resultSeveritySchema.optional(),
  commitHash: z.string().optional(),
});

export const createUserInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  tokenHash: z.string().min(1),
  role: userRoleSchema.default('tester'),
  invitedBy: z.string().email(),
});

export const inviteUserRequestSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: userRoleSchema.default('tester'),
});

export const revokeUserRequestSchema = z.object({
  email: z.string().email(),
});

export const regenerateTokenRequestSchema = z.object({
  email: z.string().email(),
});

export const updateResultIssueSchema = z.object({
  issueUrl: z.string().url(),
  issueNumber: z.number().int().positive(),
});

// --- Issue adapter schemas ---

export const openIssueSchema = z.object({
  url: z.string(),
  number: z.number().int(),
  title: z.string(),
});

export const createQAFailureOptsSchema = z.object({
  testId: z
    .string()
    .regex(/^[a-z][a-z0-9-]*-\d{3}$/, 'testId must match pattern: prefix-NNN (e.g. auth-001)'),
  testTitle: z.string().min(1),
  category: z.string().min(1),
  severity: resultSeveritySchema,
  description: z.string().min(1),
  testerName: z.string().min(1),
  testerEmail: z.string().email(),
  commitHash: z.string().optional(),
  roundName: z.string().optional(),
});

export const createSupportTicketOptsSchema = z.object({
  subject: z.string().min(1),
  description: z.string().min(1),
  userName: z.string().optional(),
  userEmail: z.string().email().optional(),
  userAgent: z.string().optional(),
  pageUrl: z.string().optional(),
  screenSize: z.string().optional(),
  category: z.string().optional(),
  consoleErrors: z.string().optional(),
  customContext: z.record(z.string(), z.string()).optional(),
});

// --- Auth request schemas ---

export const loginRequestSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

// --- Widget request schema (incoming from browser widget → server) ---

export const supportTicketRequestSchema = z.object({
  subject: z.string().min(1).max(200),
  category: z.string().min(1),
  description: z.string().max(5000).optional().default(''),
  userName: z.string().max(100).optional(),
  userEmail: z.string().email().optional(),
  context: z
    .object({
      userAgent: z.string().optional(),
      pageUrl: z.string().optional(),
      screenSize: z.string().optional(),
      viewportSize: z.string().optional(),
      consoleErrors: z.array(z.string()).max(10).optional(),
      lastError: z.string().optional(),
      timestamp: z.string().optional(),
      timezone: z.string().optional(),
      customContext: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
});

// --- Label schema ---

export const labelDefSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
  description: z.string(),
});

// --- Session schema ---

export const sessionSchema = z.object({
  id: z.string(),
  userEmail: z.string().email(),
  expiresAt: z.string(),
  createdAt: z.string(),
});

// --- Access Request schemas ---

export const accessRequestStatusSchema = z.enum(['pending', 'approved', 'rejected']);

export const accessRequestSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  status: accessRequestStatusSchema,
  message: z.string().nullable(),
  reviewedBy: z.string().email().nullable(),
  reviewedAt: z.string().nullable(),
  createdAt: z.string(),
  projectId: z.string().uuid().nullable(),
});

export const createAccessRequestInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  message: z.string().max(500).optional(),
});

// --- Main config schema ---

export const punchlistConfigSchema = z
  .object({
    projectName: z.string().min(1, 'projectName is required'),
    issueTracker: issueTrackerConfigSchema,
    storage: storageConfigSchema,
    auth: authConfigSchema,
    widget: widgetConfigSchema,
    aiTool: aiToolChoiceSchema,
    categories: z.array(categorySchema).default([]),
    testCases: z.array(testCaseSchema),
    testers: z.array(testerSchema),
  })
  .superRefine((data, ctx) => {
    // Duplicate category IDs
    const categoryIds = new Set<string>();
    for (let i = 0; i < data.categories.length; i++) {
      const id = data.categories[i].id;
      if (categoryIds.has(id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['categories', i, 'id'],
          message: `Duplicate category ID: "${id}"`,
        });
      }
      categoryIds.add(id);
    }

    // Duplicate test case IDs
    const testCaseIds = new Set<string>();
    for (let i = 0; i < data.testCases.length; i++) {
      const id = data.testCases[i].id;
      if (testCaseIds.has(id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['testCases', i, 'id'],
          message: `Duplicate test case ID: "${id}"`,
        });
      }
      testCaseIds.add(id);
    }

    // Validate category references and ID prefix matching
    const validCategoryIds = [...categoryIds];
    for (let i = 0; i < data.testCases.length; i++) {
      const tc = data.testCases[i];

      // Category must reference a valid category ID (only if categories are defined)
      if (validCategoryIds.length > 0 && !categoryIds.has(tc.category)) {
        const suggestion = findClosestMatch(tc.category, validCategoryIds);
        const hint = suggestion ? ` Did you mean "${suggestion}"?` : '';
        ctx.addIssue({
          code: 'custom',
          path: ['testCases', i, 'category'],
          message: `Category "${tc.category}" not found in categories.${hint}`,
        });
      }

      // Test ID prefix must match the category field
      const prefix = tc.id.replace(/-\d{3}$/, '');
      if (prefix !== tc.category) {
        ctx.addIssue({
          code: 'custom',
          path: ['testCases', i, 'id'],
          message: `Test ID prefix "${prefix}" does not match category "${tc.category}"`,
        });
      }
    }
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
export type Round = z.infer<typeof roundSchema>;
export type Result = z.infer<typeof resultSchema>;
export type User = z.infer<typeof userSchema>;
export type RoundStatus = z.infer<typeof roundStatusSchema>;
export type ResultSeverity = z.infer<typeof resultSeveritySchema>;
export type UserRole = z.infer<typeof userRoleSchema>;
export type CreateRoundInput = z.infer<typeof createRoundInputSchema>;
export type UpdateRoundInput = z.infer<typeof updateRoundInputSchema>;
export type SubmitResultInput = z.infer<typeof submitResultInputSchema>;
export type CreateUserInput = z.infer<typeof createUserInputSchema>;
export type InviteUserRequest = z.infer<typeof inviteUserRequestSchema>;
export type RevokeUserRequest = z.infer<typeof revokeUserRequestSchema>;
export type RegenerateTokenRequest = z.infer<typeof regenerateTokenRequestSchema>;
export type UpdateResultIssue = z.infer<typeof updateResultIssueSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type OpenIssue = z.infer<typeof openIssueSchema>;
export type CreateQAFailureOpts = z.infer<typeof createQAFailureOptsSchema>;
export type CreateSupportTicketOpts = z.infer<typeof createSupportTicketOptsSchema>;
export type LabelDef = z.infer<typeof labelDefSchema>;
export type SupportTicketRequest = z.infer<typeof supportTicketRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type AccessRequestStatus = z.infer<typeof accessRequestStatusSchema>;
export type AccessRequest = z.infer<typeof accessRequestSchema>;
export type CreateAccessRequestInput = z.infer<typeof createAccessRequestInputSchema>;
export type Project = z.infer<typeof projectSchema>;
export type ProjectUser = z.infer<typeof projectUserSchema>;
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;
