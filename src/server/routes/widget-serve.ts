import { Router } from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
// Default: resolve dist/ relative to the package root (compiled module at dist/server/routes/)
const DEFAULT_DIST_DIR = join(MODULE_DIR, '..', '..');

/**
 * Serves the bundled widget JS file.
 * Caches the file in memory after first read in production.
 */
export function widgetServeRouter(distDir = DEFAULT_DIST_DIR): Router {
  const router = Router();
  let cachedWidget: string | null = null;
  const isProd = process.env.NODE_ENV === 'production';

  router.get('/widget.js', (_req, res) => {
    if (cachedWidget) {
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(cachedWidget);
      return;
    }

    const widgetPath = join(distDir, 'widget.js');
    if (!existsSync(widgetPath)) {
      res.status(404).json({ error: 'Widget not built. Run "pnpm build:widget" first.' });
      return;
    }

    const content = readFileSync(widgetPath, 'utf-8');
    if (isProd) {
      cachedWidget = content;
    }

    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(content);
  });

  return router;
}
