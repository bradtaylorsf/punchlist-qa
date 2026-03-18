import type { LabelDef } from '../../shared/constants.js';
import type {
  OpenIssue,
  CreateQAFailureOpts,
  CreateSupportTicketOpts,
} from '../../shared/schemas.js';

export type { OpenIssue, CreateQAFailureOpts, CreateSupportTicketOpts };

export interface IssueAdapter {
  initialize(): Promise<void>;
  createIssue(opts: CreateIssueOpts): Promise<CreatedIssue>;
  createQAFailureIssue(opts: CreateQAFailureOpts): Promise<CreatedIssue>;
  createSupportTicketIssue(opts: CreateSupportTicketOpts): Promise<CreatedIssue>;
  getOpenIssueForTest(testId: string): Promise<OpenIssue | null>;
  addLabels(labels: LabelDef[]): Promise<void>;
  validateLabels(labels: LabelDef[]): Promise<string[]>;
}

export interface CreateIssueOpts {
  title: string;
  body: string;
  labels: string[];
}

export interface CreatedIssue {
  url: string;
  id: string;
  number: number;
}
