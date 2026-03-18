import { describe, it, expect } from 'vitest';
import {
  buildTestIdMarker,
  formatQAFailureTitle,
  formatQAFailureBody,
  formatSupportTicketTitle,
  formatSupportTicketBody,
} from '../../src/adapters/issues/format.js';
import type { CreateQAFailureOpts, CreateSupportTicketOpts } from '../../src/adapters/issues/types.js';

describe('issue formatting', () => {
  describe('buildTestIdMarker', () => {
    it('should produce correct HTML comment', () => {
      expect(buildTestIdMarker('auth-001')).toBe('<!-- punchlist:testId=auth-001 -->');
    });

    it('should handle hyphens and numbers', () => {
      expect(buildTestIdMarker('user-auth-042')).toBe('<!-- punchlist:testId=user-auth-042 -->');
    });
  });

  describe('formatQAFailureTitle', () => {
    it('should produce [QA Failure] title (testId)', () => {
      expect(formatQAFailureTitle('billing-001', 'Subscribe to Pro plan')).toBe(
        '[QA Failure] Subscribe to Pro plan (billing-001)'
      );
    });
  });

  describe('formatQAFailureBody', () => {
    const baseOpts: CreateQAFailureOpts = {
      testId: 'billing-001',
      testTitle: 'Subscribe to Pro plan',
      category: 'Billing',
      severity: 'broken',
      description: 'Payment form crashes on submit.',
      testerName: 'Brad Taylor',
      testerEmail: 'brad@example.com',
    };

    it('should include severity and description', () => {
      const body = formatQAFailureBody(baseOpts);
      expect(body).toContain('**Severity:** Broken');
      expect(body).toContain('Payment form crashes on submit.');
    });

    it('should include test ID marker', () => {
      const body = formatQAFailureBody(baseOpts);
      expect(body).toContain('<!-- punchlist:testId=billing-001 -->');
    });

    it('should include commit hash when provided', () => {
      const body = formatQAFailureBody({ ...baseOpts, commitHash: 'a1b2c3d' });
      expect(body).toContain('**Commit:** `a1b2c3d`');
    });

    it('should include round name when provided', () => {
      const body = formatQAFailureBody({ ...baseOpts, roundName: 'v0.27.0 RC1' });
      expect(body).toContain('**Round:** v0.27.0 RC1');
    });

    it('should omit commit hash and round when not provided', () => {
      const body = formatQAFailureBody(baseOpts);
      expect(body).not.toContain('**Commit:**');
      expect(body).not.toContain('**Round:**');
    });

    it('should include tester info', () => {
      const body = formatQAFailureBody(baseOpts);
      expect(body).toContain('**Tested by:** Brad Taylor (brad@example.com)');
    });
  });

  describe('formatSupportTicketTitle', () => {
    it('should produce [Support] subject', () => {
      expect(formatSupportTicketTitle('Cannot log in')).toBe('[Support] Cannot log in');
    });
  });

  describe('formatSupportTicketBody', () => {
    const baseOpts: CreateSupportTicketOpts = {
      subject: 'Cannot log in',
      description: 'I keep getting a 500 error when I try to log in.',
    };

    it('should include description', () => {
      const body = formatSupportTicketBody(baseOpts);
      expect(body).toContain('I keep getting a 500 error');
    });

    it('should include user info when provided', () => {
      const body = formatSupportTicketBody({
        ...baseOpts,
        userName: 'Jane Doe',
        userEmail: 'jane@example.com',
      });
      expect(body).toContain('**From:** Jane Doe (jane@example.com)');
    });

    it('should include environment info when provided', () => {
      const body = formatSupportTicketBody({
        ...baseOpts,
        userAgent: 'Chrome 120.0 / macOS 14.2',
        pageUrl: 'https://app.example.com/billing',
        screenSize: '1920x1080',
      });
      expect(body).toContain('### Environment');
      expect(body).toContain('**Browser:** Chrome 120.0 / macOS 14.2');
      expect(body).toContain('**Page URL:** https://app.example.com/billing');
      expect(body).toContain('**Screen:** 1920x1080');
    });

    it('should include console errors in details block', () => {
      const body = formatSupportTicketBody({
        ...baseOpts,
        consoleErrors: "TypeError: Cannot read properties of undefined (reading 'map')",
      });
      expect(body).toContain('<details><summary>Console Errors</summary>');
      expect(body).toContain("TypeError: Cannot read properties");
    });

    it('should include category when provided', () => {
      const body = formatSupportTicketBody({ ...baseOpts, category: 'Bug' });
      expect(body).toContain('**Category:** Bug');
    });

    it('should include custom context when provided', () => {
      const body = formatSupportTicketBody({
        ...baseOpts,
        customContext: { 'Account ID': '12345', 'Plan': 'Pro' },
      });
      expect(body).toContain('### Additional Context');
      expect(body).toContain('**Account ID:** 12345');
      expect(body).toContain('**Plan:** Pro');
    });

    it('should omit environment section when no environment info provided', () => {
      const body = formatSupportTicketBody(baseOpts);
      expect(body).not.toContain('### Environment');
    });
  });
});
