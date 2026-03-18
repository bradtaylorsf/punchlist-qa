// All types are derived from Zod schemas in schemas.ts
// This file re-exports them for backward compatibility

export type {
  PunchlistConfig,
  IssueTrackerConfig,
  StorageConfig,
  AuthConfig,
  WidgetConfig,
  TestCase,
  TestRound,
  TestResult,
  Tester,
  IssueTrackerType,
  StorageAdapterType,
  AuthAdapterType,
  AIToolChoice,
  Category,
  TestCasePriority,
} from './schemas.js';
