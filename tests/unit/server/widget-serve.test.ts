import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { widgetServeRouter } from '../../../src/server/routes/widget-serve.js';

function makeGetRequest(
  server: http.Server,
  path: string,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    http
      .get({ hostname: '127.0.0.1', port, path }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body }));
      })
      .on('error', reject);
  });
}

describe('GET /widget.js', () => {
  let server: http.Server;
  const distDir = join(process.cwd(), 'dist');

  beforeEach(() => {
    const app = express();
    app.use('/', widgetServeRouter(distDir));
    server = app.listen(0);
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('serves widget.js with correct content-type', async () => {
    // Ensure dist/widget.js exists (from the build step)
    if (!existsSync(join(distDir, 'widget.js'))) {
      mkdirSync(distDir, { recursive: true });
      writeFileSync(join(distDir, 'widget.js'), '// test widget', 'utf-8');
    }

    const res = await makeGetRequest(server, '/widget.js');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/javascript');
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('returns 404 when widget.js does not exist', async () => {
    // Temporarily rename the file if it exists
    const widgetPath = join(distDir, 'widget.js');
    const backupPath = join(distDir, 'widget.js.bak');
    let backed = false;

    if (existsSync(widgetPath)) {
      const { renameSync } = await import('node:fs');
      renameSync(widgetPath, backupPath);
      backed = true;
    }

    try {
      const res = await makeGetRequest(server, '/widget.js');
      expect(res.status).toBe(404);
    } finally {
      if (backed) {
        const { renameSync } = await import('node:fs');
        renameSync(backupPath, widgetPath);
      }
    }
  });
});
