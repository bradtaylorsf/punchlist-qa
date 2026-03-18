import { useEffect, useRef } from 'react';

interface WidgetUser {
  name: string;
  email: string;
}

declare global {
  interface Window {
    PunchlistWidget?: {
      init(opts: Record<string, unknown>): void;
      destroy(): void;
    };
  }
}

export function useWidget(user: WidgetUser | null) {
  const initialized = useRef(false);

  useEffect(() => {
    if (!user || initialized.current) return;

    const script = document.createElement('script');
    script.src = '/widget.js';
    script.async = true;
    script.onload = () => {
      if (window.PunchlistWidget && !initialized.current) {
        initialized.current = true;
        window.PunchlistWidget.init({
          serverUrl: window.location.origin,
          user: { name: user.name, email: user.email },
          categories: ['bug', 'ux', 'feature-request'],
        });
      }
    };
    document.body.appendChild(script);

    return () => {
      if (window.PunchlistWidget && initialized.current) {
        window.PunchlistWidget.destroy();
        initialized.current = false;
      }
      script.remove();
    };
  }, [user]);
}
