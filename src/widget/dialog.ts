import type { WidgetConfig, WidgetState, SubmitResult, CapturedContext } from './types.js';
import { captureContext } from './context.js';

const SUPPORT_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;

interface FormValues {
  subject: string;
  category: string;
  description: string;
  userName: string;
  userEmail: string;
}

export class WidgetDialog {
  private root: ShadowRoot;
  private config: WidgetConfig;
  private state: WidgetState = 'idle';
  private overlay: HTMLElement | null = null;
  private lastError: string | null = null;
  private onCloseCallback: (() => void) | null = null;
  private savedValues: FormValues | null = null;

  constructor(root: ShadowRoot, config: WidgetConfig) {
    this.root = root;
    this.config = config;
  }

  onClose(cb: () => void): void {
    this.onCloseCallback = cb;
  }

  open(): void {
    if (this.overlay) return;
    this.state = 'open';
    this.renderOverlay();
  }

  close(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    this.state = 'idle';
    this.lastError = null;
    this.savedValues = null;
    this.onCloseCallback?.();
  }

  private renderOverlay(): void {
    this.overlay = document.createElement('div');
    this.overlay.className = 'punchlist-overlay';
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    const dialog = document.createElement('div');
    dialog.className = 'punchlist-dialog';
    dialog.addEventListener('click', (e) => e.stopPropagation());

    this.overlay.appendChild(dialog);
    this.root.appendChild(this.overlay);

    this.renderDialogContent(dialog);

    // Escape key handler
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', onKeydown);
      }
    };
    document.addEventListener('keydown', onKeydown);
  }

  private renderDialogContent(dialog: HTMLElement): void {
    dialog.innerHTML = '';

    switch (this.state) {
      case 'open':
        this.renderForm(dialog);
        break;
      case 'submitting':
        this.renderForm(dialog, true);
        break;
      case 'success':
        this.renderSuccess(dialog);
        break;
      case 'error':
        this.renderError(dialog);
        break;
    }
  }

  private captureFormValues(dialog: HTMLElement): void {
    const getValue = (id: string): string => {
      const el = dialog.querySelector(`#${id}`) as HTMLInputElement | HTMLTextAreaElement | null;
      return el?.value?.trim() ?? '';
    };
    this.savedValues = {
      subject: getValue('punchlist-subject'),
      category: getValue('punchlist-category'),
      description: getValue('punchlist-description'),
      userName: getValue('punchlist-name'),
      userEmail: getValue('punchlist-email'),
    };
  }

  private renderForm(dialog: HTMLElement, disabled = false): void {
    const hasUser = !!(this.config.user?.name && this.config.user?.email);
    const categories = this.config.categories ?? [];
    const v = this.savedValues;

    dialog.innerHTML = `
      <div class="punchlist-dialog-header">
        <h2>${SUPPORT_ICON_SVG} Submit Feedback</h2>
        <button class="punchlist-close-btn" aria-label="Close">&times;</button>
      </div>
      <div class="punchlist-dialog-body">
        <form class="punchlist-form">
          <label class="punchlist-required" for="punchlist-subject">Subject</label>
          <input type="text" id="punchlist-subject" placeholder="Brief summary of the issue" maxlength="200" required ${disabled ? 'disabled' : ''} value="${escapeAttr(v?.subject ?? '')}" />

          <label class="punchlist-required" for="punchlist-category">Category</label>
          ${
            categories.length > 0
              ? `<select id="punchlist-category" required ${disabled ? 'disabled' : ''}>
                  <option value="">Select a category</option>
                  ${categories.map((c) => `<option value="${escapeHtml(c)}"${v?.category === c ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('')}
                </select>`
              : `<input type="text" id="punchlist-category" placeholder="e.g. bug, feature, question" required ${disabled ? 'disabled' : ''} value="${escapeAttr(v?.category ?? '')}" />`
          }

          <label for="punchlist-description">Description</label>
          <textarea id="punchlist-description" placeholder="Describe the issue in detail (optional)" maxlength="5000" ${disabled ? 'disabled' : ''}>${escapeHtml(v?.description ?? '')}</textarea>

          ${
            !hasUser
              ? `
              <label for="punchlist-name">Name</label>
              <input type="text" id="punchlist-name" placeholder="Your name (optional)" maxlength="100" ${disabled ? 'disabled' : ''} value="${escapeAttr(v?.userName ?? '')}" />

              <label for="punchlist-email">Email</label>
              <input type="email" id="punchlist-email" placeholder="Your email (optional)" ${disabled ? 'disabled' : ''} value="${escapeAttr(v?.userEmail ?? '')}" />
            `
              : ''
          }

          <button type="submit" class="punchlist-submit-btn" ${disabled ? 'disabled' : ''}>
            ${disabled ? 'Submitting...' : 'Submit'}
          </button>
        </form>
      </div>
    `;

    dialog.querySelector('.punchlist-close-btn')!.addEventListener('click', () => this.close());
    dialog.querySelector('.punchlist-form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit(dialog);
    });
  }

  private async handleSubmit(dialog: HTMLElement): Promise<void> {
    // Capture form values before re-rendering to preserve on retry
    this.captureFormValues(dialog);

    this.state = 'submitting';
    this.renderDialogContent(dialog);

    const v = this.savedValues!;
    const subject = v.subject;
    const category = v.category;
    const description = v.description;
    const userName = this.config.user?.name ?? v.userName;
    const userEmail = this.config.user?.email ?? v.userEmail;

    const context: CapturedContext = captureContext(this.config.customContext);

    const body = {
      subject,
      category,
      description: description || undefined,
      userName: userName || undefined,
      userEmail: userEmail || undefined,
      context,
    };

    try {
      const res = await fetch(`${this.config.serverUrl}/api/support/ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(data.error || `Server returned ${res.status}`);
      }

      const result: SubmitResult = await res.json();
      this.state = 'success';
      this.renderDialogContent(dialog);
      this.config.onSubmit?.(result);

      setTimeout(() => this.close(), 3000);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'Something went wrong';
      this.state = 'error';
      this.renderDialogContent(dialog);
      this.config.onError?.(err instanceof Error ? err : new Error(this.lastError));
    }
  }

  private renderSuccess(dialog: HTMLElement): void {
    dialog.innerHTML = `
      <div class="punchlist-success">
        <div class="punchlist-success-icon">&#10003;</div>
        <h3>Thank you!</h3>
        <p>Your feedback has been submitted. This dialog will close automatically.</p>
      </div>
    `;
  }

  private renderError(dialog: HTMLElement): void {
    dialog.innerHTML = `
      <div class="punchlist-error">
        <div class="punchlist-error-icon">!</div>
        <h3>Something went wrong</h3>
        <p>${escapeHtml(this.lastError ?? 'Unknown error')}</p>
        <button class="punchlist-retry-btn">Try Again</button>
      </div>
    `;

    dialog.querySelector('.punchlist-retry-btn')!.addEventListener('click', () => {
      this.state = 'open';
      this.renderDialogContent(dialog);
    });
  }
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
