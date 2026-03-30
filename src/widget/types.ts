/** Configuration for `PunchlistWidget.init()` */
export interface WidgetConfig {
  /** URL of the punchlist-qa server (e.g. "http://localhost:4747") */
  serverUrl: string;

  /** Project ID (UUID) for hosted mode — routes issues to the correct GitHub repo */
  projectId?: string;

  /** Project name — alternative to projectId for convenience */
  projectName?: string;

  /** Widget display variant */
  variant?: 'fab' | 'inline' | 'menu-item';

  /** CSS selector for the target container (required for inline and menu-item) */
  target?: string;

  /** FAB position */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

  /** Color theme */
  theme?: 'light' | 'dark';

  /** Primary accent color (CSS color value) */
  primaryColor?: string;

  /** Font family override */
  fontFamily?: string;

  /** Predefined categories for the dropdown */
  categories?: string[];

  /** Pre-fill user context */
  user?: {
    name?: string;
    email?: string;
  };

  /** Additional custom context sent with every ticket */
  customContext?: Record<string, unknown>;

  /** Callback after successful submission */
  onSubmit?: (result: SubmitResult) => void;

  /** Callback on error */
  onError?: (error: Error) => void;
}

export interface SubmitResult {
  issueUrl: string;
  issueNumber: number;
}

export interface CapturedContext {
  userAgent: string;
  pageUrl: string;
  screenSize: string;
  viewportSize: string;
  consoleErrors: string[];
  lastError: string | undefined;
  timestamp: string;
  timezone: string;
  customContext?: Record<string, unknown>;
}

/** Internal widget state */
export type WidgetState = 'idle' | 'open' | 'submitting' | 'success' | 'error';
