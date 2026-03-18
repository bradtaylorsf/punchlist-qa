import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initContextCapture, destroyContextCapture, captureContext } from '../../src/widget/context.js';

describe('context capture', () => {
  beforeEach(() => {
    initContextCapture();
  });

  afterEach(() => {
    destroyContextCapture();
  });

  it('captures browser context snapshot', () => {
    const ctx = captureContext();

    expect(ctx.userAgent).toBeDefined();
    expect(ctx.pageUrl).toBeDefined();
    expect(ctx.screenSize).toMatch(/\d+x\d+/);
    expect(ctx.viewportSize).toMatch(/\d+x\d+/);
    expect(ctx.timestamp).toBeDefined();
    expect(ctx.timezone).toBeDefined();
    expect(Array.isArray(ctx.consoleErrors)).toBe(true);
  });

  it('captures window error events', () => {
    const errorEvent = new ErrorEvent('error', { message: 'test window error' });
    window.dispatchEvent(errorEvent);

    const ctx = captureContext();
    expect(ctx.consoleErrors).toContain('test window error');
    expect(ctx.lastError).toBe('test window error');
  });

  it('includes custom context when provided', () => {
    const ctx = captureContext({ sessionId: 'abc123' });
    expect(ctx.customContext).toEqual({ sessionId: 'abc123' });
  });

  it('stops capturing after destroy', () => {
    destroyContextCapture();

    const errorEvent = new ErrorEvent('error', { message: 'after destroy' });
    window.dispatchEvent(errorEvent);

    initContextCapture();
    const ctx = captureContext();
    expect(ctx.consoleErrors).not.toContain('after destroy');
  });

  it('does not double-initialize', () => {
    // Call init again — should be a no-op
    initContextCapture();

    const errorEvent = new ErrorEvent('error', { message: 'single capture' });
    window.dispatchEvent(errorEvent);

    const ctx = captureContext();
    // Should only appear once, not twice
    const count = ctx.consoleErrors.filter((e) => e === 'single capture').length;
    expect(count).toBe(1);
  });
});
