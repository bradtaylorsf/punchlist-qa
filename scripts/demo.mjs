#!/usr/bin/env node

/**
 * Demo startup script for punchlist-qa.
 *
 * Usage: pnpm demo
 *
 * This script:
 * 1. Ensures .env has PUNCHLIST_AUTH_SECRET (generates one if missing)
 * 2. Builds the project (server + widget + dashboard)
 * 3. Creates a demo tester if none exist
 * 4. Starts the server and prints the invite token
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const ENV_PATH = '.env';
const CONFIG_PATH = 'punchlist.config.json';

function ensureEnv() {
  let content = '';
  if (existsSync(ENV_PATH)) {
    content = readFileSync(ENV_PATH, 'utf-8');
  }

  const lines = content.split('\n');
  const vars = {};
  for (const line of lines) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) vars[match[1]] = match[2];
  }

  let changed = false;

  if (!vars.PUNCHLIST_AUTH_SECRET) {
    const secret = randomBytes(32).toString('hex');
    content += `${content.endsWith('\n') || content === '' ? '' : '\n'}PUNCHLIST_AUTH_SECRET=${secret}\n`;
    changed = true;
    console.log('  Generated PUNCHLIST_AUTH_SECRET');
  }

  if (!vars.PUNCHLIST_GITHUB_TOKEN) {
    // For demo mode, set a placeholder — support widget/issues won't work but dashboard will
    content += `PUNCHLIST_GITHUB_TOKEN=demo-mode-no-github-token\n`;
    changed = true;
    console.log('  Set placeholder PUNCHLIST_GITHUB_TOKEN (set a real one for GitHub issue creation)');
  }

  if (changed) {
    writeFileSync(ENV_PATH, content, 'utf-8');
  }
}

function ensureConfig() {
  if (!existsSync(CONFIG_PATH)) {
    console.error(`\n  No ${CONFIG_PATH} found. Run this from the punchlist-qa project root.\n`);
    process.exit(1);
  }
}

function build() {
  console.log('\n  Building...');
  execSync('pnpm build', { stdio: 'inherit' });
}

function createDemoTester() {
  const email = 'demo@punchlist.dev';
  const name = 'Demo Tester';

  try {
    // Try to invite — will fail if user already exists (that's fine)
    const output = execSync(
      `node bin/punchlist.mjs invite ${email} --name "${name}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    );

    // Extract the token from invite URL in output
    const urlMatch = output.match(/token=([^\s&]+)/);
    if (urlMatch) {
      return { email, name, token: decodeURIComponent(urlMatch[1]), isNew: true };
    }

    // Couldn't parse token — print raw output for debugging
    console.log(output);
    return { email, name, token: null, isNew: true };
  } catch (err) {
    // User likely already exists — that's OK for demo
    return { email, name, token: null, isNew: false };
  }
}

function startServer(demoUser) {
  console.log('\n  ┌─────────────────────────────────────────────┐');
  console.log('  │         Punchlist QA — Demo Mode             │');
  console.log('  └─────────────────────────────────────────────┘');
  console.log('');
  console.log('  Dashboard:  http://localhost:4747/');
  console.log('  Widget JS:  http://localhost:4747/widget.js');
  console.log('  API:        http://localhost:4747/api/');
  console.log('');

  if (demoUser.token) {
    console.log('  Demo tester: ' + demoUser.email);
    console.log('  Login token: ' + demoUser.token);
    console.log('');
    console.log('  Copy the token above and paste it into the login page.');
  } else if (!demoUser.isNew) {
    console.log('  Demo tester already exists: ' + demoUser.email);
    console.log('  Re-invite to get a new token:');
    console.log('    pnpm cli revoke ' + demoUser.email);
    console.log('    pnpm cli invite ' + demoUser.email + ' --name "Demo Tester"');
  }

  console.log('');
  console.log('  Press Ctrl+C to stop.\n');

  // Start the server (replaces this process)
  execSync('node bin/punchlist.mjs serve', { stdio: 'inherit' });
}

// --- Main ---

console.log('\n  Punchlist QA Demo Setup\n');

ensureConfig();
ensureEnv();
build();
const demoUser = createDemoTester();
startServer(demoUser);
