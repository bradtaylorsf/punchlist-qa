---
name: widget-patterns
description: Support widget development — vanilla JS, scoped styles, CORS proxy, zero dependencies
metadata:
  short-description: Embeddable support widget patterns
---

# Support Widget Patterns

Use this skill when building or modifying the embeddable support widget.

## Use When

- "Add a feature to the support widget"
- "How does the widget communicate with the server?"
- "Style the widget without affecting the host page"
- "Add custom context to support tickets"

## Architecture

The support widget is a **single JavaScript file** served by the QA dashboard server at `/widget.js`. It is embedded in consuming projects via a script tag:

```html
<script src="https://qa.yourapp.com/widget.js"
  data-project="my-project"
  data-api="https://qa.yourapp.com">
</script>
```

**Zero dependencies in the consuming project.** No npm install, no framework, no build step.

## Design Constraints

- **Vanilla JavaScript only** — no frameworks, no build tools in the widget itself
- **Scoped inline styles** — no CSS files, no global class names, no style conflicts
- **Shadow DOM** — use Shadow DOM to encapsulate widget styles and markup
- **Self-contained** — the widget bundles everything it needs
- **Lightweight** — target < 15KB gzipped

## Widget → Server Communication

The widget submits support tickets to the QA dashboard server via CORS:

```javascript
// Widget sends POST to the dashboard server
fetch(`${apiUrl}/api/widget/tickets`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: userTitle,
    description: userDescription,
    context: {
      url: window.location.href,
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      timestamp: new Date().toISOString(),
      ...customContext  // Developer-provided context
    }
  })
});
```

## CORS Configuration

The server maintains a domain allowlist for widget origins:

```typescript
// Server-side CORS middleware for widget endpoints
app.use('/api/widget', cors({
  origin: (origin, callback) => {
    if (config.widgetAllowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
```

## Auto-Captured Context

The widget automatically captures browser context on every submission:

- `url` — current page URL
- `userAgent` — browser user agent string
- `viewport` — viewport dimensions
- `timestamp` — ISO 8601 timestamp
- `referrer` — document referrer
- `language` — browser language

## Developer-Provided Context

Consuming projects can pass custom context via the widget API:

```javascript
// Consuming project sets custom context
window.PunchlistQA.setContext({
  userId: 'user-123',
  plan: 'enterprise',
  featureFlags: { newDashboard: true }
});
```

## Shadow DOM Encapsulation

```javascript
class PunchlistWidget extends HTMLElement {
  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>
        /* All styles scoped to shadow DOM — no leaking */
        .punchlist-trigger { /* ... */ }
        .punchlist-form { /* ... */ }
      </style>
      <div class="punchlist-trigger"><!-- widget UI --></div>
    `;
  }
}
customElements.define('punchlist-widget', PunchlistWidget);
```

## Guardrails

- Never add npm dependencies to the widget — it must be self-contained
- Never use global CSS classes — always Shadow DOM or scoped inline styles
- Never access `document.cookie` or `localStorage` of the host page
- Always validate the server URL from `data-api` attribute
- Always include auto-captured browser context on submissions
- Test the widget in multiple browsers (Chrome, Firefox, Safari)
- Keep the bundle under 15KB gzipped
