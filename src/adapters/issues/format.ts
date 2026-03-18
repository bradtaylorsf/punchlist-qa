import type { CreateQAFailureOpts, CreateSupportTicketOpts } from './types.js';

export function sanitizeForHtmlComment(value: string): string {
  return value.replace(/-->/g, '');
}

export function buildTestIdMarker(testId: string): string {
  return `<!-- punchlist:testId=${sanitizeForHtmlComment(testId)} -->`;
}

export function formatQAFailureTitle(testId: string, testTitle: string): string {
  return `[QA Failure] ${testTitle} (${testId})`;
}

export function formatQAFailureBody(opts: CreateQAFailureOpts): string {
  const lines: string[] = [
    '## QA Failure Report',
    '',
    `**Test ID:** \`${opts.testId}\``,
    `**Test Title:** ${opts.testTitle}`,
    `**Category:** ${opts.category}`,
    `**Severity:** ${opts.severity.charAt(0).toUpperCase() + opts.severity.slice(1)}`,
  ];

  if (opts.roundName) {
    lines.push(`**Round:** ${opts.roundName}`);
  }
  if (opts.commitHash) {
    lines.push(`**Commit:** \`${opts.commitHash}\``);
  }

  lines.push('', '### What Went Wrong', opts.description);
  lines.push(
    '',
    '---',
    `**Tested by:** ${opts.testerName} (${opts.testerEmail})`,
    '*Filed via [Punchlist QA](https://github.com/bradtaylorsf/punchlist-qa)*',
    buildTestIdMarker(opts.testId),
  );

  return lines.join('\n');
}

export function formatSupportTicketTitle(subject: string): string {
  return `[Support] ${subject}`;
}

export function formatSupportTicketBody(opts: CreateSupportTicketOpts): string {
  const lines: string[] = ['## Support Request', ''];

  if (opts.userName || opts.userEmail) {
    const from =
      opts.userName && opts.userEmail
        ? `${opts.userName} (${opts.userEmail})`
        : opts.userName || opts.userEmail;
    lines.push(`**From:** ${from}`);
  }

  if (opts.category) {
    lines.push(`**Category:** ${opts.category}`);
  }

  lines.push('', '### Description', opts.description);

  const envLines: string[] = [];
  if (opts.userAgent) envLines.push(`- **Browser:** ${opts.userAgent}`);
  if (opts.pageUrl) envLines.push(`- **Page URL:** ${opts.pageUrl}`);
  if (opts.screenSize) envLines.push(`- **Screen:** ${opts.screenSize}`);

  if (envLines.length > 0) {
    lines.push('', '### Environment', ...envLines);
  }

  if (opts.consoleErrors) {
    lines.push(
      '',
      '<details><summary>Console Errors</summary>',
      '',
      '```',
      opts.consoleErrors,
      '```',
      '',
      '</details>',
    );
  }

  if (opts.customContext && Object.keys(opts.customContext).length > 0) {
    lines.push('', '### Additional Context');
    for (const [key, value] of Object.entries(opts.customContext)) {
      lines.push(`- **${key}:** ${value}`);
    }
  }

  lines.push(
    '',
    '---',
    '*Submitted via [Punchlist QA](https://github.com/bradtaylorsf/punchlist-qa) Support Widget*',
  );

  return lines.join('\n');
}
