import type {
  IssueAdapter,
  CreateIssueOpts,
  CreatedIssue,
  OpenIssue,
  CreateQAFailureOpts,
  CreateSupportTicketOpts,
} from './types.js';
import type { LabelDef } from '../../shared/constants.js';

export class GitHubIssueAdapter implements IssueAdapter {
  private owner: string;
  private repo: string;
  private token: string;

  constructor(repoSlug: string, token: string) {
    const [owner, repo] = repoSlug.split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid repo format: ${repoSlug}. Expected "owner/repo".`);
    }
    this.owner = owner;
    this.repo = repo;
    this.token = token;
  }

  private async request(path: string, method: string, body?: unknown): Promise<Response> {
    const url = `https://api.github.com${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return res;
  }

  async createIssue(opts: CreateIssueOpts): Promise<CreatedIssue> {
    const res = await this.request(
      `/repos/${this.owner}/${this.repo}/issues`,
      'POST',
      { title: opts.title, body: opts.body, labels: opts.labels }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to create issue: ${res.status} ${text}`);
    }

    const data = await res.json() as { html_url: string; id: number; number: number };
    return { url: data.html_url, id: String(data.id), number: data.number };
  }

  async initialize(): Promise<void> {
    throw new Error('Not implemented');
  }

  async createQAFailureIssue(_opts: CreateQAFailureOpts): Promise<CreatedIssue> {
    throw new Error('Not implemented');
  }

  async createSupportTicketIssue(_opts: CreateSupportTicketOpts): Promise<CreatedIssue> {
    throw new Error('Not implemented');
  }

  async getOpenIssueForTest(_testId: string): Promise<OpenIssue | null> {
    throw new Error('Not implemented');
  }

  async validateLabels(_labels: LabelDef[]): Promise<string[]> {
    throw new Error('Not implemented');
  }

  async addLabels(labels: LabelDef[]): Promise<void> {
    for (const label of labels) {
      const res = await this.request(
        `/repos/${this.owner}/${this.repo}/labels`,
        'POST',
        { name: label.name, color: label.color, description: label.description }
      );

      if (!res.ok) {
        const status = res.status;
        // 422 means label already exists — that's fine
        if (status === 422) {
          // Try to update the existing label instead
          await this.request(
            `/repos/${this.owner}/${this.repo}/labels/${encodeURIComponent(label.name)}`,
            'PATCH',
            { color: label.color, description: label.description }
          );
        } else {
          const text = await res.text();
          console.warn(`Warning: Failed to create label "${label.name}": ${status} ${text}`);
        }
      }
    }
  }
}
