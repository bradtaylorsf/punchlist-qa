import type { CapturedContext } from './types.js';

const MAX_ERRORS = 10;
let errorBuffer: string[] = [];
let lastError: string | undefined;
let initialized = false;
let errorHandler: ((event: ErrorEvent) => void) | null = null;
let rejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;

/**
 * Start capturing window.error and unhandledrejection events.
 * Buffers the last MAX_ERRORS messages.
 *
 * Note: Does NOT monkey-patch console.error/console.warn to avoid
 * conflicts with host application logging and other libraries.
 */
export function initContextCapture(): void {
  if (initialized) return;
  initialized = true;

  errorHandler = (event: ErrorEvent) => {
    const msg = event.message || 'Unknown error';
    lastError = msg;
    pushError(msg);
  };

  rejectionHandler = (event: PromiseRejectionEvent) => {
    const msg = event.reason instanceof Error ? event.reason.message : String(event.reason);
    lastError = msg;
    pushError(`[unhandled rejection] ${msg}`);
  };

  window.addEventListener('error', errorHandler);
  window.addEventListener('unhandledrejection', rejectionHandler);
}

function pushError(msg: string): void {
  errorBuffer.push(msg);
  if (errorBuffer.length > MAX_ERRORS) {
    errorBuffer = errorBuffer.slice(-MAX_ERRORS);
  }
}

/**
 * Remove event listeners and clear captured state.
 */
export function destroyContextCapture(): void {
  if (!initialized) return;
  if (errorHandler) window.removeEventListener('error', errorHandler);
  if (rejectionHandler) window.removeEventListener('unhandledrejection', rejectionHandler);
  errorHandler = null;
  rejectionHandler = null;
  errorBuffer = [];
  lastError = undefined;
  initialized = false;
}

/**
 * Collect current browser context snapshot.
 */
export function captureContext(customContext?: Record<string, unknown>): CapturedContext {
  return {
    userAgent: navigator.userAgent,
    pageUrl: window.location.href,
    screenSize: `${screen.width}x${screen.height}`,
    viewportSize: `${window.innerWidth}x${window.innerHeight}`,
    consoleErrors: [...errorBuffer],
    lastError,
    timestamp: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...(customContext ? { customContext } : {}),
  };
}
