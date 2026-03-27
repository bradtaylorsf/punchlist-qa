<!-- punchlist-skill-version: 1.0.0 -->

# Integrate the Punchlist QA Widget

## Purpose

Help a developer add the Punchlist QA support widget to their web application. The widget is a zero-dependency, Shadow DOM-isolated script tag that lets users file issues directly from any page. This skill contains the full API reference so you can guide the developer through integration without guessing.

## Quick Start

Add the script tag and initialize:

```html
<script src="https://your-punchlist-server.com/widget.js"></script>
<script>
  PunchlistWidget.init({
    serverUrl: 'https://your-punchlist-server.com'
  });
</script>
```

That's all that's required. Everything below is optional customization.

## Configuration Reference

`PunchlistWidget.init(config)` accepts the following options:

### Required

| Option | Type | Description |
|--------|------|-------------|
| `serverUrl` | `string` | URL of the Punchlist QA server (e.g. `https://qa.myapp.com` or `http://localhost:4747`) |

### Optional

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `variant` | `'fab' \| 'inline' \| 'menu-item'` | `'fab'` | Trigger button style |
| `position` | `'bottom-right' \| 'bottom-left' \| 'top-right' \| 'top-left'` | `'bottom-right'` | FAB position (only applies to `fab` variant) |
| `target` | `string` | — | CSS selector for container element (required for `inline` and `menu-item` variants) |
| `theme` | `'light' \| 'dark'` | `'light'` | Color theme |
| `primaryColor` | `string` | `'#6f42c1'` | Accent color for buttons and highlights. Must be a valid hex color (e.g. `#ff5500`) |
| `fontFamily` | `string` | System font stack | Custom font family for all widget text |
| `categories` | `string[]` | `[]` | Predefined category options shown as a dropdown. If empty, a free-text input is shown instead |
| `user` | `{ name?: string; email?: string }` | — | Pre-fill user identity. When provided, the name/email fields are hidden from the form |
| `customContext` | `Record<string, unknown>` | — | Arbitrary key-value pairs attached to every submitted ticket |
| `onSubmit` | `(result: { issueUrl: string; issueNumber: number }) => void` | — | Callback fired after successful submission |
| `onError` | `(error: Error) => void` | — | Callback fired on submission failure |

## Variants

### FAB (Floating Action Button) — default

A 56px circular button fixed to the corner of the viewport. Clicking it opens the feedback dialog.

```javascript
PunchlistWidget.init({
  serverUrl: 'https://qa.myapp.com',
  variant: 'fab',
  position: 'bottom-right'
});
```

### Inline Button

A regular button injected into an existing DOM element. Use this when you want the trigger inside your app's UI.

```javascript
PunchlistWidget.init({
  serverUrl: 'https://qa.myapp.com',
  variant: 'inline',
  target: '#feedback-container'
});
```

The button text is "Submit Feedback". The `target` must be a valid CSS selector pointing to an existing element.

### Menu Item Button

A full-width button designed to sit inside a sidebar or dropdown menu.

```javascript
PunchlistWidget.init({
  serverUrl: 'https://qa.myapp.com',
  variant: 'menu-item',
  target: '.sidebar-menu'
});
```

The button text is "Report an Issue".

## JavaScript API

The widget exposes four methods on the global `PunchlistWidget` object:

```javascript
// Initialize — call once on page load
PunchlistWidget.init(config);

// Open the feedback dialog programmatically
PunchlistWidget.open();

// Close the dialog programmatically
PunchlistWidget.close();

// Remove the widget entirely (cleanup)
PunchlistWidget.destroy();
```

## Theming

### Light vs Dark

```javascript
PunchlistWidget.init({
  serverUrl: 'https://qa.myapp.com',
  theme: 'dark'
});
```

### Custom Brand Color

```javascript
PunchlistWidget.init({
  serverUrl: 'https://qa.myapp.com',
  primaryColor: '#e11d48'
});
```

The primary color is used for the FAB background, submit button, and focus rings.

### Custom Font

```javascript
PunchlistWidget.init({
  serverUrl: 'https://qa.myapp.com',
  fontFamily: '"Inter", sans-serif'
});
```

## Pre-filling User Identity

If your app knows who the user is, pass their info to skip the name/email fields:

```javascript
PunchlistWidget.init({
  serverUrl: 'https://qa.myapp.com',
  user: {
    name: currentUser.displayName,
    email: currentUser.email
  }
});
```

## Categories

Provide an array to show a dropdown instead of a free-text input:

```javascript
PunchlistWidget.init({
  serverUrl: 'https://qa.myapp.com',
  categories: ['bug', 'feature-request', 'ux', 'question']
});
```

If the server has categories configured in `punchlist.config.json` under `widget.categories`, those are used as the server-side default. Client-side `categories` in `init()` override them.

## Custom Context

Attach arbitrary metadata to every ticket:

```javascript
PunchlistWidget.init({
  serverUrl: 'https://qa.myapp.com',
  customContext: {
    appVersion: '2.4.1',
    environment: 'staging',
    userId: currentUser.id,
    featureFlags: getActiveFlags()
  }
});
```

## Callbacks

```javascript
PunchlistWidget.init({
  serverUrl: 'https://qa.myapp.com',
  onSubmit: (result) => {
    console.log(`Issue filed: ${result.issueUrl}`);
    analytics.track('feedback_submitted', { issueNumber: result.issueNumber });
  },
  onError: (error) => {
    console.error('Widget submission failed:', error.message);
  }
});
```

## Automatic Context Capture

The widget automatically captures and sends with every ticket:

| Field | Description |
|-------|-------------|
| `userAgent` | Browser user agent string |
| `pageUrl` | Current page URL |
| `screenSize` | Screen dimensions (e.g. `1920x1080`) |
| `viewportSize` | Browser viewport dimensions |
| `consoleErrors` | Last 10 uncaught errors on the page |
| `lastError` | Most recent error message |
| `timestamp` | ISO 8601 timestamp |
| `timezone` | User's timezone |

No setup needed — this happens automatically.

## CORS Setup

The widget makes a POST request to `{serverUrl}/api/support/ticket`. The server validates the request origin against the `corsDomains` list in `punchlist.config.json`.

Add your app's domain to the allowed list during `punchlist-qa init`, or edit `punchlist.config.json`:

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

The `widget.js` file itself is served with `Access-Control-Allow-Origin: *` so it can be loaded from any domain.

## Form Fields

The dialog form includes:

| Field | Type | Required | Max Length |
|-------|------|----------|-----------|
| Subject | text input | Yes | 200 chars |
| Category | dropdown or text input | Yes | — |
| Description | textarea | No | 5000 chars |
| Name | text input (hidden if `user` provided) | No | 100 chars |
| Email | email input (hidden if `user` provided) | No | — |

## Full Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>My App</title>
</head>
<body>
  <div id="app">
    <!-- your app content -->
    <nav class="sidebar">
      <div id="feedback-slot"></div>
    </nav>
  </div>

  <script src="https://qa.myapp.com/widget.js"></script>
  <script>
    PunchlistWidget.init({
      serverUrl: 'https://qa.myapp.com',
      variant: 'menu-item',
      target: '#feedback-slot',
      theme: 'dark',
      primaryColor: '#3b82f6',
      categories: ['bug', 'feature-request', 'ux', 'performance'],
      user: {
        name: window.__USER__?.name,
        email: window.__USER__?.email,
      },
      customContext: {
        appVersion: '2.4.1',
        environment: 'staging',
      },
      onSubmit: (result) => {
        console.log('Ticket created:', result.issueUrl);
      },
    });
  </script>
</body>
</html>
```

## SPA Framework Integration

In single-page apps, the DOM may not be ready when the script loads. Call `init()` after your app mounts.

### React

```jsx
import { useEffect } from 'react';

function App() {
  useEffect(() => {
    if (window.PunchlistWidget) {
      window.PunchlistWidget.init({
        serverUrl: 'https://qa.myapp.com',
        variant: 'fab',
        user: { name: currentUser.name, email: currentUser.email },
      });
    }
    return () => window.PunchlistWidget?.destroy();
  }, []);

  return <div id="app">...</div>;
}
```

### Vue

```js
export default {
  mounted() {
    window.PunchlistWidget?.init({
      serverUrl: 'https://qa.myapp.com',
      variant: 'fab',
    });
  },
  beforeUnmount() {
    window.PunchlistWidget?.destroy();
  },
};
```

### Key points

- Load the `<script src="...widget.js">` in your `index.html` as usual
- Call `init()` inside a lifecycle hook (`useEffect`, `mounted`, `ngOnInit`) — not at the top level
- Call `destroy()` on unmount if the widget should not persist across route changes
- For `inline` and `menu-item` variants, ensure the `target` element is rendered before calling `init()`

## Workflow

1. **Read the project** — examine the app's HTML structure, framework, and existing scripts
2. **Choose a variant** — `fab` for a quick overlay, `inline` or `menu-item` if there's a natural place in the UI
3. **Determine config** — figure out which options are relevant: theme, categories, user pre-fill, etc.
4. **Add the script tag** — place it before the closing `</body>` tag or load it dynamically
5. **Add the init call** — configure with the appropriate options
6. **Verify CORS** — ensure the app's origin is in the server's `corsDomains` list
7. **Test** — open the page, click the trigger, submit a test ticket, verify it appears in GitHub Issues

## Guardrails

- **The widget is self-contained.** It uses Shadow DOM. It will not conflict with the host app's styles or JavaScript.
- **Do not import or require the widget.** It's an IIFE script loaded via `<script src>`. The global `PunchlistWidget` object is available after the script loads.
- **Only call `init()` once.** Subsequent calls are a no-op with a console warning.
- **`serverUrl` must be the full origin** — e.g. `https://qa.myapp.com`, not `https://qa.myapp.com/api`.
- **`target` must exist in the DOM** before `init()` is called. If using a SPA, call `init()` after the target element renders.
- **Do not hardcode tokens or secrets** in the widget config. The widget is client-side JavaScript visible to anyone.
