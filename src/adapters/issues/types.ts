import type { LabelDef } from '../../shared/constants.js';

export interface IssueAdapter {
  createIssue(opts: CreateIssueOpts): Promise<CreatedIssue>;
  addLabels(labels: LabelDef[]): Promise<void>;
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
