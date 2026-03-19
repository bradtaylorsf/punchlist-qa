# Widget Integration Guide

The Punchlist QA widget is a zero-dependency script tag that adds a bug reporter button to any website. It submits tickets directly to your issue tracker via the Punchlist QA server.

## Quick Start

Add a single script tag to your HTML:

```html
<script
  src="https://your-punchlist-server.com/widget.js"
  data-server="https://your-punchlist-server.com"
></script>
```

That's it. A floating button appears in the corner of the page.

## Configuration Options

All configuration is via `data-*` attributes on the script tag:

| Attribute | Required | Default | Description |
|-----------|----------|---------|-------------|
| `data-server` | Yes | — | URL of your Punchlist QA server |
| `data-position` | No | `bottom-right` | Button position: `bottom-right`, `bottom-left`, `top-right`, `top-left` |
| `data-theme` | No | `light` | Color theme: `light` or `dark` |

## CORS Setup

The widget makes cross-origin requests to your Punchlist QA server. You must add your app's origin to the `corsDomains` array in `punchlist.config.json`:

```json
{
  "widget": {
    "corsDomains": [
      "http://localhost:3000",
      "https://myapp.com",
      "https://staging.myapp.com"
    ]
  }
}
```

### Troubleshooting CORS

**"Blocked by CORS policy" in browser console:**
- Verify the origin (including protocol and port) is in `corsDomains`
- `http://localhost:3000` and `http://127.0.0.1:3000` are different origins
- Restart the Punchlist QA server after changing config

**Widget loads but tickets fail:**
- Check browser Network tab for the actual error response
- Verify the Punchlist QA server is running and accessible from the browser

## Framework Examples

### Plain HTML

```html
<!DOCTYPE html>
<html>
<body>
  <h1>My App</h1>

  <script
    src="https://punchlist.example.com/widget.js"
    data-server="https://punchlist.example.com"
    data-position="bottom-right"
    data-theme="light"
  ></script>
</body>
</html>
```

### React / Next.js

Add the widget in your root layout or a shared component using `next/script`:

```tsx
// app/layout.tsx (Next.js App Router)
import Script from 'next/script';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        {process.env.NODE_ENV !== 'production' && (
          <Script
            src="https://punchlist.example.com/widget.js"
            data-server="https://punchlist.example.com"
            strategy="lazyOnload"
          />
        )}
      </body>
    </html>
  );
}
```

For Create React App or Vite React:

```tsx
// src/App.tsx
import { useEffect } from 'react';

function App() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const script = document.createElement('script');
      script.src = 'http://localhost:4747/widget.js';
      script.dataset.server = 'http://localhost:4747';
      document.body.appendChild(script);
      return () => { document.body.removeChild(script); };
    }
  }, []);

  return <div>My App</div>;
}
```

### Vue

```vue
<!-- App.vue -->
<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue';

let scriptEl;
onMounted(() => {
  if (import.meta.env.DEV) {
    scriptEl = document.createElement('script');
    scriptEl.src = 'http://localhost:4747/widget.js';
    scriptEl.dataset.server = 'http://localhost:4747';
    document.body.appendChild(scriptEl);
  }
});
onUnmounted(() => {
  if (scriptEl) document.body.removeChild(scriptEl);
});
</script>
```

## Programmatic API

The widget exposes a global `PunchlistQA` object for programmatic control:

```javascript
// Open the widget programmatically
window.PunchlistQA?.open();

// Close the widget
window.PunchlistQA?.close();

// Pre-fill fields
window.PunchlistQA?.open({
  category: 'bug',
  subject: 'Button not working',
  description: 'The submit button on /checkout is unresponsive',
});
```

## Scoped Styles

The widget uses Shadow DOM to isolate its styles from your application. It will not affect your app's CSS, and your CSS will not affect the widget.

## Production Considerations

- Only load the widget in environments where you want bug reports (dev, staging, QA)
- Use environment variables to conditionally include the script tag
- The widget is lightweight (~15 KB gzipped) and loads asynchronously
