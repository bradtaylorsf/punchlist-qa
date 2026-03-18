import { describe, it, expect } from 'vitest';
import { mapRequestToOpts } from '../../../src/server/routes/support.js';

describe('mapRequestToOpts', () => {
  it('maps minimal request to flat opts', () => {
    const result = mapRequestToOpts({
      subject: 'Bug report',
      category: 'bug',
      description: '',
    });

    expect(result).toEqual({
      subject: 'Bug report',
      category: 'bug',
      description: '',
      userName: undefined,
      userEmail: undefined,
      userAgent: undefined,
      pageUrl: undefined,
      screenSize: undefined,
      consoleErrors: undefined,
      customContext: undefined,
    });
  });

  it('maps user fields', () => {
    const result = mapRequestToOpts({
      subject: 'Help',
      category: 'question',
      description: 'Need help',
      userName: 'Jane',
      userEmail: 'jane@example.com',
    });

    expect(result.userName).toBe('Jane');
    expect(result.userEmail).toBe('jane@example.com');
  });

  it('maps context fields to flat structure', () => {
    const result = mapRequestToOpts({
      subject: 'UI issue',
      category: 'bug',
      description: '',
      context: {
        userAgent: 'Chrome/120',
        pageUrl: 'https://example.com/app',
        screenSize: '1920x1080',
        consoleErrors: ['Error A', 'Error B'],
        customContext: { sessionId: 'xyz', tenant: 'acme' },
      },
    });

    expect(result.userAgent).toBe('Chrome/120');
    expect(result.pageUrl).toBe('https://example.com/app');
    expect(result.screenSize).toBe('1920x1080');
    expect(result.consoleErrors).toBe('Error A\nError B');
    expect(result.customContext).toEqual({ sessionId: 'xyz', tenant: 'acme' });
  });

  it('joins console errors with newlines', () => {
    const result = mapRequestToOpts({
      subject: 'Errors',
      category: 'bug',
      description: '',
      context: {
        consoleErrors: ['TypeError: x', 'ReferenceError: y', 'SyntaxError: z'],
      },
    });

    expect(result.consoleErrors).toBe('TypeError: x\nReferenceError: y\nSyntaxError: z');
  });

  it('handles empty console errors array', () => {
    const result = mapRequestToOpts({
      subject: 'Clean',
      category: 'feature',
      description: '',
      context: {
        consoleErrors: [],
      },
    });

    expect(result.consoleErrors).toBe('');
  });

  it('handles context without optional fields', () => {
    const result = mapRequestToOpts({
      subject: 'Minimal context',
      category: 'bug',
      description: '',
      context: {},
    });

    expect(result.userAgent).toBeUndefined();
    expect(result.pageUrl).toBeUndefined();
    expect(result.consoleErrors).toBeUndefined();
    expect(result.customContext).toBeUndefined();
  });
});
