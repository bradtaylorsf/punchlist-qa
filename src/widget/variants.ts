import type { WidgetConfig } from './types.js';

const CHAT_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

/** Simple CSS selector format validation — allows tag, class, id, and attribute selectors */
const SAFE_SELECTOR_RE = /^[a-zA-Z0-9\s\-_#.,[\]="':>+~()*^$|]+$/;

function queryTarget(selector: string): Element | null {
  if (!SAFE_SELECTOR_RE.test(selector)) {
    console.warn(`[PunchlistWidget] Invalid target selector "${selector}", rendering in shadow root.`);
    return null;
  }
  try {
    return document.querySelector(selector);
  } catch {
    console.warn(`[PunchlistWidget] Failed to query target "${selector}", rendering in shadow root.`);
    return null;
  }
}

/**
 * Creates the trigger element for the configured variant.
 * Returns the element that, when clicked, should open the dialog.
 */
export function createTrigger(
  root: ShadowRoot,
  config: WidgetConfig,
  onClick: () => void,
): HTMLElement {
  const variant = config.variant ?? 'fab';

  switch (variant) {
    case 'fab':
      return createFab(root, config, onClick);
    case 'inline':
      return createInline(root, config, onClick);
    case 'menu-item':
      return createMenuItem(root, config, onClick);
  }
}

function createFab(root: ShadowRoot, config: WidgetConfig, onClick: () => void): HTMLElement {
  const btn = document.createElement('button');
  btn.className = `punchlist-fab ${config.position ?? 'bottom-right'}`;
  btn.innerHTML = CHAT_ICON_SVG;
  btn.setAttribute('aria-label', 'Submit feedback');
  btn.addEventListener('click', onClick);
  root.appendChild(btn);
  return btn;
}

function createInline(root: ShadowRoot, config: WidgetConfig, onClick: () => void): HTMLElement {
  const btn = document.createElement('button');
  btn.className = 'punchlist-inline-btn';
  btn.textContent = 'Submit Feedback';
  btn.addEventListener('click', onClick);

  if (config.target) {
    const target = queryTarget(config.target);
    if (target) {
      target.appendChild(btn);
      return btn;
    }
  }

  root.appendChild(btn);
  return btn;
}

function createMenuItem(root: ShadowRoot, config: WidgetConfig, onClick: () => void): HTMLElement {
  const btn = document.createElement('button');
  btn.className = 'punchlist-menu-btn';
  btn.textContent = 'Report an Issue';
  btn.addEventListener('click', onClick);

  if (config.target) {
    const target = queryTarget(config.target);
    if (target) {
      target.appendChild(btn);
      return btn;
    }
  }

  root.appendChild(btn);
  return btn;
}
