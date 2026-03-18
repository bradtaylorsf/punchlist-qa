/**
 * Generate scoped CSS for the widget shadow DOM.
 * Supports light/dark themes and customizable primary color + font.
 */
export function getWidgetStyles(opts: {
  theme: 'light' | 'dark';
  primaryColor: string;
  fontFamily: string;
}): string {
  const { theme, primaryColor, fontFamily } = opts;

  const isDark = theme === 'dark';
  const bg = isDark ? '#1e1e2e' : '#ffffff';
  const bgSecondary = isDark ? '#2a2a3e' : '#f5f5f7';
  const text = isDark ? '#e0e0e0' : '#1a1a1a';
  const textSecondary = isDark ? '#a0a0b0' : '#666666';
  const border = isDark ? '#3a3a4e' : '#e0e0e0';
  const inputBg = isDark ? '#2a2a3e' : '#ffffff';
  const overlayBg = 'rgba(0, 0, 0, 0.5)';

  return `
    :host {
      all: initial;
      font-family: ${fontFamily};
      color: ${text};
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    /* FAB trigger button */
    .punchlist-fab {
      position: fixed;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: ${primaryColor};
      color: #ffffff;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
      z-index: 2147483647;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .punchlist-fab:hover {
      transform: scale(1.08);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
    }

    .punchlist-fab.bottom-right { bottom: 24px; right: 24px; }
    .punchlist-fab.bottom-left { bottom: 24px; left: 24px; }
    .punchlist-fab.top-right { top: 24px; right: 24px; }
    .punchlist-fab.top-left { top: 24px; left: 24px; }

    .punchlist-fab svg {
      width: 24px;
      height: 24px;
      fill: currentColor;
    }

    /* Inline / menu-item trigger */
    .punchlist-inline-btn,
    .punchlist-menu-btn {
      background: ${primaryColor};
      color: #ffffff;
      border: none;
      cursor: pointer;
      font-family: ${fontFamily};
      font-size: 14px;
      font-weight: 500;
    }

    .punchlist-inline-btn {
      padding: 10px 20px;
      border-radius: 8px;
    }

    .punchlist-menu-btn {
      padding: 8px 16px;
      border-radius: 4px;
      width: 100%;
      text-align: left;
    }

    /* Overlay */
    .punchlist-overlay {
      position: fixed;
      inset: 0;
      background: ${overlayBg};
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483647;
      animation: punchlist-fade-in 0.2s ease;
    }

    @keyframes punchlist-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    /* Dialog */
    .punchlist-dialog {
      background: ${bg};
      border-radius: 12px;
      width: 90%;
      max-width: 480px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      animation: punchlist-slide-up 0.25s ease;
    }

    @keyframes punchlist-slide-up {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    .punchlist-dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px 0;
    }

    .punchlist-dialog-header h2 {
      font-size: 18px;
      font-weight: 600;
      color: ${text};
    }

    .punchlist-close-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: ${textSecondary};
      font-size: 20px;
      padding: 4px;
      line-height: 1;
    }

    .punchlist-dialog-body {
      padding: 20px 24px 24px;
    }

    /* Form */
    .punchlist-form label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: ${textSecondary};
      margin-bottom: 4px;
    }

    .punchlist-form input,
    .punchlist-form textarea,
    .punchlist-form select {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid ${border};
      border-radius: 8px;
      font-family: ${fontFamily};
      font-size: 14px;
      color: ${text};
      background: ${inputBg};
      margin-bottom: 16px;
      outline: none;
      transition: border-color 0.2s;
    }

    .punchlist-form input:focus,
    .punchlist-form textarea:focus,
    .punchlist-form select:focus {
      border-color: ${primaryColor};
    }

    .punchlist-form textarea {
      resize: vertical;
      min-height: 80px;
    }

    .punchlist-form .punchlist-required::after {
      content: ' *';
      color: #e11d48;
    }

    .punchlist-submit-btn {
      width: 100%;
      padding: 12px;
      background: ${primaryColor};
      color: #ffffff;
      border: none;
      border-radius: 8px;
      font-family: ${fontFamily};
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .punchlist-submit-btn:hover { opacity: 0.9; }
    .punchlist-submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    /* States */
    .punchlist-success {
      text-align: center;
      padding: 40px 24px;
    }

    .punchlist-success-icon {
      font-size: 48px;
      margin-bottom: 12px;
    }

    .punchlist-success h3 {
      font-size: 18px;
      color: ${text};
      margin-bottom: 8px;
    }

    .punchlist-success p {
      color: ${textSecondary};
      font-size: 14px;
    }

    .punchlist-error {
      text-align: center;
      padding: 40px 24px;
    }

    .punchlist-error-icon {
      font-size: 48px;
      margin-bottom: 12px;
    }

    .punchlist-error h3 {
      color: #e11d48;
      font-size: 18px;
      margin-bottom: 8px;
    }

    .punchlist-error p {
      color: ${textSecondary};
      font-size: 14px;
      margin-bottom: 16px;
    }

    .punchlist-retry-btn {
      padding: 10px 24px;
      background: ${bgSecondary};
      color: ${text};
      border: 1px solid ${border};
      border-radius: 8px;
      font-family: ${fontFamily};
      font-size: 14px;
      cursor: pointer;
    }
  `;
}
