import type { WidgetConfig } from './types.js';
import { getWidgetStyles } from './styles.js';
import { WidgetDialog } from './dialog.js';
import { createTrigger } from './variants.js';
import { initContextCapture, destroyContextCapture } from './context.js';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const SAFE_FONT_FAMILY_RE = /^[\w\s\-,'"().]+$/;

let host: HTMLElement | null = null;
let dialog: WidgetDialog | null = null;
let triggerEl: HTMLElement | null = null;

function validateServerUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`[PunchlistWidget] serverUrl must use http: or https: protocol, got "${parsed.protocol}"`);
    }
    return parsed.origin;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('[PunchlistWidget]')) throw err;
    throw new Error(`[PunchlistWidget] Invalid serverUrl: "${url}"`, { cause: err });
  }
}

function sanitizePrimaryColor(color: string | undefined): string {
  const fallback = '#6f42c1';
  if (!color) return fallback;
  if (HEX_COLOR_RE.test(color)) return color;
  console.warn(`[PunchlistWidget] Invalid primaryColor "${color}", using default.`);
  return fallback;
}

function sanitizeFontFamily(font: string | undefined): string {
  const fallback = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  if (!font) return fallback;
  if (SAFE_FONT_FAMILY_RE.test(font)) return font;
  console.warn(`[PunchlistWidget] Invalid fontFamily "${font}", using default.`);
  return fallback;
}

/**
 * Initialize the Punchlist support widget.
 * Creates a shadow DOM host, injects styles, renders the trigger and dialog.
 */
function init(config: WidgetConfig): void {
  if (host) {
    console.warn('[PunchlistWidget] Already initialized. Call destroy() first.');
    return;
  }

  // Validate serverUrl before anything else
  const serverUrl = validateServerUrl(config.serverUrl);
  const validatedConfig = { ...config, serverUrl };

  // Start capturing console errors and global errors
  initContextCapture();

  // Create shadow DOM host
  host = document.createElement('div');
  host.id = 'punchlist-widget';
  const shadow = host.attachShadow({ mode: 'open' });

  // Inject scoped styles with sanitized values
  const style = document.createElement('style');
  style.textContent = getWidgetStyles({
    theme: config.theme ?? 'light',
    primaryColor: sanitizePrimaryColor(config.primaryColor),
    fontFamily: sanitizeFontFamily(config.fontFamily),
  });
  shadow.appendChild(style);

  // Create dialog controller
  dialog = new WidgetDialog(shadow, validatedConfig);

  // Create trigger element
  const isFab = config.variant !== 'inline' && config.variant !== 'menu-item';
  triggerEl = createTrigger(shadow, validatedConfig, () => {
    if (isFab && triggerEl) triggerEl.style.display = 'none';
    dialog!.open();
  });

  // Restore FAB trigger when dialog closes
  dialog.onClose(() => {
    if (isFab && triggerEl) triggerEl.style.display = '';
  });

  document.body.appendChild(host);
}

/** Open the dialog programmatically */
function open(): void {
  if (!dialog) {
    console.warn('[PunchlistWidget] Not initialized. Call init() first.');
    return;
  }
  dialog.open();
}

/** Close the dialog programmatically */
function close(): void {
  if (!dialog) return;
  dialog.close();
}

/** Destroy the widget and clean up */
function destroy(): void {
  dialog?.close();
  dialog = null;
  triggerEl = null;

  if (host) {
    host.remove();
    host = null;
  }

  destroyContextCapture();
}

// Export public API for IIFE bundle
export { init, open, close, destroy };
